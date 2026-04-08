"""Query engine for the ClearNotation SQLite index.

Reads the index created by ``indexer.py`` and supports filtered queries
with AND semantics, corpus-level statistics, and staleness checks.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from .indexer import DB_NAME, check_staleness


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

def query_index(
    root: Path,
    *,
    directive: str | None = None,
    references: str | None = None,
    title: str | None = None,
    attribute: str | None = None,
    db_path: Path | None = None,
) -> list[dict[str, Any]]:
    """Query the CLN index with AND semantics across filters.

    Returns list of dicts with keys: ``path``, ``title``, ``directives``,
    ``references``.

    Raises :class:`FileNotFoundError` if no index DB exists.
    """
    root = root.resolve()
    if db_path is None:
        db_path = root / DB_NAME

    if not db_path.exists():
        raise FileNotFoundError(f"No index database found at {db_path}")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        # Build the set of matching document paths using AND semantics.
        # Start with all documents, then intersect with each filter.
        candidate_paths: set[str] | None = None

        if directive is not None:
            rows = conn.execute(
                "SELECT DISTINCT document_path FROM directives WHERE directive_name = ?",
                (directive,),
            ).fetchall()
            paths = {r["document_path"] for r in rows}
            candidate_paths = paths if candidate_paths is None else candidate_paths & paths

        if references is not None:
            rows = conn.execute(
                'SELECT DISTINCT document_path FROM "references" WHERE ref_target = ?',
                (references,),
            ).fetchall()
            paths = {r["document_path"] for r in rows}
            candidate_paths = paths if candidate_paths is None else candidate_paths & paths

        if title is not None:
            rows = conn.execute(
                "SELECT path FROM documents WHERE title LIKE ?",
                (f"%{title}%",),
            ).fetchall()
            paths = {r["path"] for r in rows}
            candidate_paths = paths if candidate_paths is None else candidate_paths & paths

        if attribute is not None:
            # Demo-quality: LIKE against the JSON text in the attributes column.
            # Expects format key=value.
            if "=" in attribute:
                key, value = attribute.split("=", 1)
                like_pattern = f'%"{key}": "{value}"%'
            else:
                like_pattern = f"%{attribute}%"
            rows = conn.execute(
                "SELECT DISTINCT document_path FROM directives WHERE attributes LIKE ?",
                (like_pattern,),
            ).fetchall()
            paths = {r["document_path"] for r in rows}
            candidate_paths = paths if candidate_paths is None else candidate_paths & paths

        # If no filters were specified, return all documents.
        if candidate_paths is None:
            doc_rows = conn.execute("SELECT path, title FROM documents ORDER BY path").fetchall()
        else:
            if not candidate_paths:
                return []
            placeholders = ",".join("?" for _ in candidate_paths)
            doc_rows = conn.execute(
                f"SELECT path, title FROM documents WHERE path IN ({placeholders}) ORDER BY path",
                tuple(sorted(candidate_paths)),
            ).fetchall()

        results: list[dict[str, Any]] = []
        for doc in doc_rows:
            doc_path = doc["path"]

            # Gather directive names for this document.
            dir_rows = conn.execute(
                "SELECT DISTINCT directive_name FROM directives WHERE document_path = ?",
                (doc_path,),
            ).fetchall()
            directives_list = sorted({r["directive_name"] for r in dir_rows})

            # Gather reference targets for this document.
            ref_rows = conn.execute(
                'SELECT DISTINCT ref_target FROM "references" WHERE document_path = ?',
                (doc_path,),
            ).fetchall()
            references_list = sorted({r["ref_target"] for r in ref_rows})

            results.append({
                "path": doc_path,
                "title": doc["title"],
                "directives": directives_list,
                "references": references_list,
            })

        return results
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Corpus statistics
# ---------------------------------------------------------------------------

def corpus_stats(root: Path, db_path: Path | None = None) -> dict[str, Any]:
    """Return corpus-level stats.

    Keys:
    - ``total_documents``: number of indexed documents
    - ``directive_histogram``: ``{name: count, ...}``
    - ``broken_references``: list of dicts with ``from``, ``to``, ``anchor``
    """
    root = root.resolve()
    if db_path is None:
        db_path = root / DB_NAME

    if not db_path.exists():
        raise FileNotFoundError(f"No index database found at {db_path}")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        # Total documents
        total = conn.execute("SELECT COUNT(*) AS cnt FROM documents").fetchone()["cnt"]

        # Directive histogram
        hist_rows = conn.execute(
            "SELECT directive_name, COUNT(*) AS cnt FROM directives GROUP BY directive_name ORDER BY cnt DESC"
        ).fetchall()
        histogram = {r["directive_name"]: r["cnt"] for r in hist_rows}

        # Broken references: cross_references whose target_document is NOT in documents
        broken_rows = conn.execute(
            "SELECT cr.document_path, cr.target_document, cr.anchor "
            "FROM cross_references cr "
            "LEFT JOIN documents d ON cr.target_document = d.path "
            "WHERE d.path IS NULL"
        ).fetchall()
        broken = [
            {"from": r["document_path"], "to": r["target_document"], "anchor": r["anchor"]}
            for r in broken_rows
        ]

        return {
            "total_documents": total,
            "directive_histogram": histogram,
            "broken_references": broken,
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Staleness check
# ---------------------------------------------------------------------------

def check_and_warn_staleness(root: Path) -> bool:
    """Return True if the index is stale (any .cln file newer than the DB)."""
    return check_staleness(root)


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------

def format_results(results: list[dict[str, Any]]) -> str:
    """Format query results for terminal output."""
    if not results:
        return "No matching documents found."

    lines: list[str] = []
    lines.append(f"Found {len(results)} document(s):\n")
    for r in results:
        title = r.get("title") or "(untitled)"
        lines.append(f"  {r['path']}")
        lines.append(f"    Title: {title}")
        if r.get("directives"):
            lines.append(f"    Directives: {', '.join(r['directives'])}")
        if r.get("references"):
            lines.append(f"    References: {', '.join(r['references'])}")
        lines.append("")
    return "\n".join(lines)


def format_stats(stats: dict[str, Any]) -> str:
    """Format corpus stats for terminal output."""
    lines: list[str] = []
    lines.append(f"Total documents: {stats['total_documents']}")
    lines.append("")

    hist = stats.get("directive_histogram", {})
    if hist:
        lines.append("Directive usage:")
        for name, count in sorted(hist.items(), key=lambda x: -x[1]):
            lines.append(f"  {name}: {count}")
        lines.append("")

    broken = stats.get("broken_references", [])
    if broken:
        lines.append(f"Broken references ({len(broken)}):")
        for b in broken:
            anchor_part = f"#{b['anchor']}" if b.get("anchor") else ""
            lines.append(f"  {b['from']} -> {b['to']}{anchor_part}")
        lines.append("")
    else:
        lines.append("No broken references.")

    return "\n".join(lines)
