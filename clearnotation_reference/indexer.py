"""SQLite indexer for ClearNotation projects.

Walks a directory of .cln files, parses each through the ClearNotation pipeline,
extracts structured metadata, and stores it in a SQLite database.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import load_config
from .errors import ClearNotationError, MultipleValidationFailures
from .models import (
    BlockDirective,
    BlockNode,
    Document,
    Emphasis,
    Heading,
    InlineNode,
    Link,
    NBlockQuote,
    NCallout,
    NFigure,
    NHeading,
    NOrderedItem,
    NOrderedList,
    NParagraph,
    NRef,
    NTable,
    NTableCell,
    NUnorderedList,
    NormalizedBlock,
    NormalizedDocument,
    NormalizedInline,
    Note,
    Strong,
    Text,
)
from .normalizer import Normalizer
from .parser import ReferenceParser
from .registry import Registry
from .validator import ReferenceValidator

DB_NAME = ".cln-index.db"

_SCHEMA = """\
CREATE TABLE IF NOT EXISTS documents (
    path TEXT PRIMARY KEY,
    title TEXT,
    last_modified REAL,
    indexed_at REAL
);
CREATE TABLE IF NOT EXISTS directives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_path TEXT NOT NULL,
    directive_name TEXT NOT NULL,
    attributes TEXT,
    line_number INTEGER,
    FOREIGN KEY (document_path) REFERENCES documents(path)
);
CREATE TABLE IF NOT EXISTS "references" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_path TEXT NOT NULL,
    ref_target TEXT NOT NULL,
    ref_type TEXT,
    line_number INTEGER,
    FOREIGN KEY (document_path) REFERENCES documents(path)
);
CREATE TABLE IF NOT EXISTS cross_references (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_path TEXT NOT NULL,
    target_document TEXT NOT NULL,
    anchor TEXT,
    FOREIGN KEY (document_path) REFERENCES documents(path)
);
"""


@dataclass
class IndexStats:
    indexed: int = 0
    skipped: int = 0
    unchanged: int = 0
    errors: list[str] = field(default_factory=list)


def index_directory(
    root: Path,
    config_path: str | None = None,
    db_path: Path | None = None,
) -> IndexStats:
    """Index all .cln files under *root* into SQLite."""
    root = root.resolve()
    if db_path is None:
        db_path = root / DB_NAME

    try:
        conn = sqlite3.connect(str(db_path))
    except sqlite3.Error as exc:
        raise OSError(f"Cannot open index database at {db_path}: {exc}") from exc

    try:
        conn.executescript(_SCHEMA)
    except sqlite3.Error as exc:
        conn.close()
        raise OSError(f"Cannot initialize index database at {db_path}: {exc}") from exc

    stats = IndexStats()

    cln_files = sorted(root.rglob("*.cln"))
    for cln_path in cln_files:
        rel = str(cln_path.relative_to(root))
        mtime = cln_path.stat().st_mtime

        # Check if unchanged
        row = conn.execute(
            "SELECT last_modified FROM documents WHERE path = ?", (rel,)
        ).fetchone()
        if row is not None and row[0] == mtime:
            stats.unchanged += 1
            continue

        # Parse and index
        try:
            _index_file(conn, root, cln_path, rel, mtime, config_path)
            stats.indexed += 1
        except Exception as exc:
            msg = f"{rel}: {exc}"
            stats.errors.append(msg)
            stats.skipped += 1
            print(f"WARNING: skipping {rel}: {exc}", file=sys.stderr)

    try:
        conn.commit()
    except sqlite3.Error as exc:
        conn.close()
        raise OSError(f"Cannot write to index database: {exc}") from exc
    conn.close()
    return stats


def check_staleness(root: Path) -> bool:
    """Return True if any .cln file is newer than the index DB."""
    root = root.resolve()
    db_path = root / DB_NAME
    if not db_path.exists():
        return True
    db_mtime = db_path.stat().st_mtime
    for cln_path in root.rglob("*.cln"):
        if cln_path.stat().st_mtime > db_mtime:
            return True
    return False


def _index_file(
    conn: sqlite3.Connection,
    root: Path,
    cln_path: Path,
    rel: str,
    mtime: float,
    config_path: str | None,
) -> None:
    """Parse, validate, normalize, and store one .cln file."""
    source = cln_path.read_text(encoding="utf-8")

    config, reg_data = load_config(cln_path, config_path)
    registry = Registry.from_toml(reg_data)
    parser = ReferenceParser(registry)
    parsed_doc = parser.parse_document(source, cln_path)

    validator = ReferenceValidator(registry)
    validator.validate(parsed_doc, config=config)

    normalizer = Normalizer(registry)
    normalized_doc = normalizer.normalize(parsed_doc)

    title = _extract_title(parsed_doc)
    directives = _extract_directives(parsed_doc.blocks)
    refs = _extract_refs(normalized_doc)
    cross_refs = _extract_cross_refs(parsed_doc.blocks)

    # Clear old data for this document
    conn.execute("DELETE FROM directives WHERE document_path = ?", (rel,))
    conn.execute('DELETE FROM "references" WHERE document_path = ?', (rel,))
    conn.execute("DELETE FROM cross_references WHERE document_path = ?", (rel,))
    conn.execute("DELETE FROM documents WHERE path = ?", (rel,))

    # Insert document
    conn.execute(
        "INSERT INTO documents (path, title, last_modified, indexed_at) VALUES (?, ?, ?, ?)",
        (rel, title, mtime, time.time()),
    )

    # Insert directives
    for d in directives:
        conn.execute(
            "INSERT INTO directives (document_path, directive_name, attributes, line_number) "
            "VALUES (?, ?, ?, ?)",
            (rel, d["name"], json.dumps(d["attrs"]), d["line"]),
        )

    # Insert references
    for r in refs:
        conn.execute(
            'INSERT INTO "references" (document_path, ref_target, ref_type, line_number) '
            "VALUES (?, ?, ?, ?)",
            (rel, r["target"], r.get("type"), r.get("line")),
        )

    # Insert cross-references
    for cr in cross_refs:
        conn.execute(
            "INSERT INTO cross_references (document_path, target_document, anchor) "
            "VALUES (?, ?, ?)",
            (rel, cr["target_document"], cr.get("anchor")),
        )


def _extract_title(doc: Document) -> str | None:
    """Return the text of the first Heading in the document, or None."""
    for block in doc.blocks:
        if isinstance(block, Heading):
            return _plain_text(block.children)
    return None


def _extract_directives(blocks: list[BlockNode]) -> list[dict[str, Any]]:
    """Recursively extract BlockDirective metadata from parsed blocks."""
    result: list[dict[str, Any]] = []
    for block in blocks:
        if isinstance(block, BlockDirective):
            result.append({
                "name": block.name,
                "attrs": {k: _json_safe(v) for k, v in block.attrs.items()},
                "line": block.source_line,
            })
            # Recurse into nested blocks
            result.extend(_extract_directives(block.blocks))
    return result


def _extract_refs(normalized_doc: NormalizedDocument) -> list[dict[str, Any]]:
    """Extract NRef nodes from a normalized document."""
    result: list[dict[str, Any]] = []
    for block in normalized_doc.blocks:
        _walk_normalized_block_for_refs(block, result)
    return result


def _walk_normalized_block_for_refs(
    block: NormalizedBlock,
    result: list[dict[str, Any]],
) -> None:
    """Recursively walk a normalized block and collect NRef nodes."""
    inlines: list[list[NormalizedInline]] = []

    if isinstance(block, NHeading):
        inlines.append(block.content)
    elif isinstance(block, NParagraph):
        inlines.append(block.content)
    elif isinstance(block, NBlockQuote):
        for line in block.lines:
            inlines.append(line)
    elif isinstance(block, NUnorderedList):
        for item in block.items:
            inlines.append(item)
    elif isinstance(block, NOrderedList):
        for item in block.items:
            inlines.append(item.content)
    elif isinstance(block, NCallout):
        for sub in block.blocks:
            _walk_normalized_block_for_refs(sub, result)
    elif isinstance(block, NFigure):
        for sub in block.blocks:
            _walk_normalized_block_for_refs(sub, result)
    elif isinstance(block, NTable):
        for row in block.rows:
            for cell in row.cells:
                inlines.append(cell.content)

    for inline_list in inlines:
        _collect_refs_from_inlines(inline_list, result)


def _collect_refs_from_inlines(
    inlines: list[NormalizedInline],
    result: list[dict[str, Any]],
) -> None:
    """Collect NRef nodes from a list of normalized inline nodes."""
    for node in inlines:
        if isinstance(node, NRef):
            result.append({"target": node.target, "type": "ref"})
        elif isinstance(node, Strong):
            _collect_refs_from_inlines(node.children, result)
        elif isinstance(node, Emphasis):
            _collect_refs_from_inlines(node.children, result)
        elif isinstance(node, Link):
            _collect_refs_from_inlines(node.label, result)
        elif isinstance(node, Note):
            _collect_refs_from_inlines(node.children, result)


def _extract_cross_refs(blocks: list[BlockNode]) -> list[dict[str, Any]]:
    """Extract cross-references (links to .cln files) from parsed blocks."""
    result: list[dict[str, Any]] = []
    for block in blocks:
        _walk_block_for_cross_refs(block, result)
    return result


def _walk_block_for_cross_refs(
    block: BlockNode,
    result: list[dict[str, Any]],
) -> None:
    """Recursively walk a parsed block and collect cross-ref Link nodes."""
    inlines: list[list[InlineNode]] = []

    if isinstance(block, Heading):
        inlines.append(block.children)
    elif hasattr(block, "children") and isinstance(getattr(block, "children"), list):
        inlines.append(block.children)
    elif hasattr(block, "lines"):
        for line in block.lines:
            inlines.append(line)
    elif hasattr(block, "items"):
        for item in block.items:
            if isinstance(item, list):
                inlines.append(item)
            elif hasattr(item, "children"):
                inlines.append(item.children)

    if isinstance(block, BlockDirective):
        for sub in block.blocks:
            _walk_block_for_cross_refs(sub, result)

    for inline_list in inlines:
        _collect_cross_refs_from_inlines(inline_list, result)


def _collect_cross_refs_from_inlines(
    inlines: list[InlineNode],
    result: list[dict[str, Any]],
) -> None:
    """Collect Link nodes that point to .cln files."""
    for node in inlines:
        if isinstance(node, Link) and ".cln" in node.target:
            target = node.target
            if "#" in target:
                doc, anchor = target.split("#", 1)
            else:
                doc, anchor = target, None
            result.append({"target_document": doc, "anchor": anchor})
        elif isinstance(node, Strong):
            _collect_cross_refs_from_inlines(node.children, result)
        elif isinstance(node, Emphasis):
            _collect_cross_refs_from_inlines(node.children, result)
        elif isinstance(node, Note):
            _collect_cross_refs_from_inlines(node.children, result)


def _plain_text(inlines: list[InlineNode]) -> str:
    """Extract plain text from inline nodes."""
    parts: list[str] = []
    for node in inlines:
        if isinstance(node, Text):
            parts.append(node.value)
        elif isinstance(node, Strong):
            parts.append(_plain_text(node.children))
        elif isinstance(node, Emphasis):
            parts.append(_plain_text(node.children))
        elif isinstance(node, Link):
            parts.append(_plain_text(node.label))
    return "".join(parts)


def _json_safe(value: Any) -> Any:
    """Ensure a value is JSON-serializable."""
    if isinstance(value, (str, int, float, bool, type(None))):
        return value
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    return str(value)
