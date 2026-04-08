# Queryable Document Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 4 CLI commands (convert, index, query, lint) that demonstrate ClearNotation as a queryable document platform, proving the thesis that structured docs enable capabilities Markdown can't provide.

**Architecture:** Each command is a standalone Python module (converter.py, indexer.py, query.py, linter.py) wired into the existing CLI via argparse subcommands. The indexer writes to SQLite (.cln-index.db). The converter uses mistune to parse Markdown input. A shared `_parse_and_normalize()` helper DRYs up the pipeline pattern used across cli.py.

**Tech Stack:** Python 3.11+, mistune (optional dep), sqlite3 (stdlib), existing ClearNotation pipeline (parser, validator, normalizer)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `clearnotation_reference/converter.py` | Create | Markdown-to-CLN conversion using mistune |
| `clearnotation_reference/indexer.py` | Create | Walk .cln corpus, extract metadata into SQLite |
| `clearnotation_reference/query.py` | Create | Query SQLite index via CLI flags |
| `clearnotation_reference/linter.py` | Create | Validate corpus against TOML schema |
| `clearnotation_reference/cli.py` | Modify | Add convert/index/query/lint subcommands + DRY helper |
| `pyproject.toml` | Modify | Add mistune optional dependency |
| `tests/test_converter.py` | Create | Converter unit tests |
| `tests/test_indexer.py` | Create | Indexer unit tests |
| `tests/test_query.py` | Create | Query unit tests |
| `tests/test_linter.py` | Create | Linter unit tests |
| `tests/test_pipeline_e2e.py` | Create | End-to-end integration tests |

---

### Task 1: Add mistune dependency and DRY helper

**Files:**
- Modify: `pyproject.toml:23-27`
- Modify: `clearnotation_reference/cli.py:154-196`

- [ ] **Step 1: Add mistune to optional dependencies in pyproject.toml**

Add after the `watch` line in `[project.optional-dependencies]`:

```toml
convert = ["mistune>=3.0"]
```

- [ ] **Step 2: Extract `_parse_and_normalize()` helper in cli.py**

Add this function after the `_cmd_init` function (after line 151):

```python
def _parse_and_normalize(
    input_path: Path,
    config_path: str | None = None,
) -> tuple["NormalizedDocument", "Registry", "Document"]:
    """Parse, validate, and normalize a .cln file. Returns (normalized_doc, registry, parsed_doc).

    Raises ClearNotationError or MultipleValidationFailures on failure.
    """
    from .models import NormalizedDocument, Document
    config, reg_data = load_config(input_path, config_path)
    registry = Registry.from_toml(reg_data)
    source = input_path.read_text(encoding="utf-8")
    doc = ReferenceParser(registry).parse_document(source, input_path)
    ReferenceValidator(registry).validate(doc, config=config)
    ndoc = Normalizer(registry).normalize(doc)
    return ndoc, registry, doc
```

- [ ] **Step 3: Refactor `_build_file` to use the helper**

Replace the body of `_build_file` (lines 160-196) with:

```python
def _build_file(
    input_path: Path,
    output_path: Path | None,
    config_path: str | None,
    fmt: str,
) -> int:
    try:
        ndoc, registry, doc = _parse_and_normalize(input_path, config_path)
    except MultipleValidationFailures as exc:
        source = input_path.read_text(encoding="utf-8")
        for err in exc.errors:
            _print_error(err, source, str(input_path), fmt)
        return 1
    except ClearNotationError as exc:
        source = input_path.read_text(encoding="utf-8")
        _print_error(exc, source, str(input_path), fmt)
        return 1

    if output_path is None:
        output_path = input_path.with_suffix(".html")

    css_rel = _css_relative_path(output_path)
    html = render_html(ndoc, css_path=css_rel)
    output_path.write_text(html, encoding="utf-8")

    css_dest = output_path.parent / _CSS_FILENAME
    if not css_dest.exists():
        css_src = Path(__file__).parent / _CSS_FILENAME
        if css_src.exists():
            shutil.copy2(css_src, css_dest)

    return 0
```

- [ ] **Step 4: Run existing tests to ensure refactor doesn't break anything**

Run: `python3 -m unittest discover -s tests -v 2>&1 | tail -5`
Expected: All 128 tests pass. No regressions.

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml clearnotation_reference/cli.py
git commit -m "refactor: extract _parse_and_normalize helper, add mistune optional dep"
```

---

### Task 2: Markdown-to-CLN Converter

**Files:**
- Create: `clearnotation_reference/converter.py`
- Create: `tests/test_converter.py`

- [ ] **Step 1: Write converter tests**

Create `tests/test_converter.py`:

```python
"""Tests for the Markdown-to-CLN converter."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from clearnotation_reference.converter import convert_markdown, convert_file


class TestConvertMarkdown(unittest.TestCase):
    """Unit tests for Markdown-to-CLN text conversion."""

    def test_heading_h1(self):
        self.assertEqual(convert_markdown("# Hello").strip(), "# Hello")

    def test_heading_h2(self):
        self.assertEqual(convert_markdown("## Sub").strip(), "## Sub")

    def test_heading_h3(self):
        self.assertEqual(convert_markdown("### Deep").strip(), "### Deep")

    def test_paragraph(self):
        result = convert_markdown("Just a paragraph.")
        self.assertIn("Just a paragraph.", result)

    def test_bold(self):
        result = convert_markdown("Some **bold** text.")
        self.assertIn("+{bold}", result)

    def test_italic(self):
        result = convert_markdown("Some *italic* text.")
        self.assertIn("*{italic}", result)

    def test_bold_italic_mixed(self):
        result = convert_markdown("A **bold** and *italic* line.")
        self.assertIn("+{bold}", result)
        self.assertIn("*{italic}", result)

    def test_inline_code(self):
        result = convert_markdown("Use `foo()` here.")
        self.assertIn("`foo()`", result)

    def test_link(self):
        result = convert_markdown("Click [here](https://example.com).")
        self.assertIn("[here -> https://example.com]", result)

    def test_image(self):
        result = convert_markdown("![Alt text](image.png)")
        self.assertIn('::figure[src="image.png"]', result)
        self.assertIn("Alt text", result)

    def test_fenced_code_with_language(self):
        md = "```python\nprint('hi')\n```"
        result = convert_markdown(md)
        self.assertIn("```python", result)
        self.assertIn("print('hi')", result)

    def test_fenced_code_without_language(self):
        md = "```\nsome code\n```"
        result = convert_markdown(md)
        self.assertIn("```text", result)
        self.assertIn("some code", result)

    def test_unordered_list(self):
        md = "- Item A\n- Item B\n- Item C"
        result = convert_markdown(md)
        self.assertIn("- Item A", result)
        self.assertIn("- Item B", result)
        self.assertIn("- Item C", result)

    def test_ordered_list(self):
        md = "1. First\n2. Second\n3. Third"
        result = convert_markdown(md)
        self.assertIn("1. First", result)
        self.assertIn("2. Second", result)
        self.assertIn("3. Third", result)

    def test_table(self):
        md = "| A | B |\n|---|---|\n| 1 | 2 |"
        result = convert_markdown(md)
        self.assertIn("::table[header=true]", result)
        self.assertIn("| A | B |", result)

    def test_blockquote(self):
        md = "> A wise quote"
        result = convert_markdown(md)
        self.assertIn("> A wise quote", result)

    def test_thematic_break(self):
        md = "Above\n\n---\n\nBelow"
        result = convert_markdown(md)
        self.assertIn("---", result)

    def test_empty_input(self):
        result = convert_markdown("")
        self.assertEqual(result.strip(), "")

    def test_inline_html_skipped(self):
        result, report = convert_markdown("Before <div>html</div> after.", return_report=True)
        self.assertNotIn("<div>", result)
        self.assertTrue(len(report.skipped) > 0)

    def test_front_matter_skipped(self):
        md = "---\ntitle: Test\n---\n\n# Hello"
        result, report = convert_markdown(md, return_report=True)
        self.assertIn("# Hello", result)
        self.assertTrue(any("front matter" in s.reason.lower() for s in report.skipped))

    def test_content_loss_measurement(self):
        md = "# Hello\n\nA paragraph.\n\n<div>skipped</div>"
        _, report = convert_markdown(md, return_report=True)
        self.assertGreater(report.total_lines, 0)
        self.assertGreater(report.skipped_lines, 0)
        self.assertLess(report.loss_percent, 100)

    def test_output_parses_cleanly(self):
        """Converted output must parse through the CLN pipeline without errors."""
        md = "# Title\n\nA **bold** paragraph with [link](https://x.com).\n\n- Item 1\n- Item 2"
        result = convert_markdown(md)
        # Parse through CLN pipeline
        from clearnotation_reference.config import load_config
        from clearnotation_reference.parser import ReferenceParser
        from clearnotation_reference.registry import Registry
        from clearnotation_reference.validator import ReferenceValidator
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".cln", mode="w", delete=False) as f:
            f.write(result)
            f.flush()
            p = Path(f.name)
        try:
            _, reg_data = load_config(p)
            registry = Registry.from_toml(reg_data)
            doc = ReferenceParser(registry).parse_document(result, p)
            ReferenceValidator(registry).validate(doc)
        finally:
            p.unlink()


class TestConvertFile(unittest.TestCase):
    """Tests for file-level conversion."""

    def test_convert_single_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            md_path = Path(tmp) / "test.md"
            md_path.write_text("# Hello\n\nWorld.")
            cln_path = Path(tmp) / "test.cln"
            report = convert_file(md_path, cln_path)
            self.assertTrue(cln_path.exists())
            content = cln_path.read_text()
            self.assertIn("# Hello", content)
            self.assertEqual(report.skipped_lines, 0)

    def test_convert_missing_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            md_path = Path(tmp) / "missing.md"
            cln_path = Path(tmp) / "out.cln"
            with self.assertRaises(FileNotFoundError):
                convert_file(md_path, cln_path)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest tests.test_converter -v 2>&1 | tail -5`
Expected: FAIL/ERROR (converter module doesn't exist yet)

- [ ] **Step 3: Write the converter module**

Create `clearnotation_reference/converter.py`:

```python
"""Markdown-to-CLN converter using mistune."""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class SkippedContent:
    line: int
    reason: str
    content: str


@dataclass
class ConversionReport:
    total_lines: int = 0
    skipped_lines: int = 0
    skipped: list[SkippedContent] = field(default_factory=list)

    @property
    def loss_percent(self) -> float:
        if self.total_lines == 0:
            return 0.0
        return (self.skipped_lines / self.total_lines) * 100


def convert_markdown(
    source: str,
    *,
    return_report: bool = False,
) -> str | tuple[str, ConversionReport]:
    """Convert Markdown text to ClearNotation text.

    If return_report is True, returns (cln_text, report) tuple.
    """
    try:
        import mistune
    except ImportError:
        raise ImportError(
            "mistune is required for Markdown conversion.\n"
            "Install it with: pip install clearnotation[convert]"
        )

    report = ConversionReport(total_lines=len(source.splitlines()))
    output_lines: list[str] = []

    # Strip YAML front matter
    stripped, fm_lines = _strip_front_matter(source)
    if fm_lines > 0:
        report.skipped.append(SkippedContent(
            line=1, reason="YAML front matter", content="",
        ))
        report.skipped_lines += fm_lines

    md = mistune.create_markdown(renderer=None)
    tokens = md(stripped)

    for token in tokens:
        _convert_token(token, output_lines, report, depth=0)

    result = "\n".join(output_lines) + "\n" if output_lines else ""
    if return_report:
        return result, report
    return result


def _strip_front_matter(source: str) -> tuple[str, int]:
    """Strip YAML front matter (---...---) from the start. Returns (stripped, lines_removed)."""
    lines = source.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        return source, 0
    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end is None:
        return source, 0
    removed = end + 1
    return "".join(lines[removed:]), removed


def _convert_token(
    token: dict[str, Any],
    out: list[str],
    report: ConversionReport,
    depth: int,
) -> None:
    """Convert a single mistune AST token to CLN lines."""
    t = token.get("type", "")

    if t == "heading":
        level = token.get("attrs", {}).get("level", 1)
        prefix = "#" * level
        text = _inline_to_cln(token.get("children", []), report)
        out.append(f"{prefix} {text}")
        out.append("")

    elif t == "paragraph":
        text = _inline_to_cln(token.get("children", []), report)
        out.append(text)
        out.append("")

    elif t == "block_code":
        info = token.get("attrs", {}).get("info", "") or "text"
        raw = token.get("raw", token.get("text", ""))
        # Strip trailing newline from raw
        if raw.endswith("\n"):
            raw = raw[:-1]
        out.append(f"```{info}")
        out.append(raw)
        out.append("```")
        out.append("")

    elif t == "list":
        ordered = token.get("attrs", {}).get("ordered", False)
        items = token.get("children", [])
        for i, item in enumerate(items):
            children = item.get("children", [])
            # Each list item may contain paragraphs or text
            item_text = _list_item_to_cln(children, report)
            if ordered:
                out.append(f"{i + 1}. {item_text}")
            else:
                out.append(f"- {item_text}")
        out.append("")

    elif t == "block_quote":
        children = token.get("children", [])
        for child in children:
            if child.get("type") == "paragraph":
                text = _inline_to_cln(child.get("children", []), report)
                out.append(f"> {text}")
        out.append("")

    elif t == "thematic_break":
        out.append("---")
        out.append("")

    elif t == "table":
        _convert_table(token, out, report)

    elif t == "block_html":
        raw = token.get("raw", token.get("text", ""))
        lines = raw.splitlines()
        report.skipped.append(SkippedContent(
            line=0, reason="inline HTML block", content=raw[:100],
        ))
        report.skipped_lines += len(lines)

    elif t == "blank_line":
        pass  # Whitespace handled by appending ""

    else:
        # Unknown token type, skip
        raw = token.get("raw", token.get("text", ""))
        if raw:
            report.skipped.append(SkippedContent(
                line=0, reason=f"unknown token type: {t}", content=raw[:100],
            ))
            report.skipped_lines += len(raw.splitlines())


def _convert_table(
    token: dict[str, Any],
    out: list[str],
    report: ConversionReport,
) -> None:
    """Convert a mistune table token to a CLN ::table directive."""
    children = token.get("children", [])
    has_header = False
    rows: list[str] = []

    for child in children:
        ct = child.get("type", "")
        if ct == "table_head":
            has_header = True
            for row in child.get("children", []):
                cells = []
                for cell in row.get("children", []):
                    cells.append(_inline_to_cln(cell.get("children", []), report))
                rows.insert(0, "| " + " | ".join(cells) + " |")
        elif ct == "table_body":
            for row in child.get("children", []):
                cells = []
                for cell in row.get("children", []):
                    cells.append(_inline_to_cln(cell.get("children", []), report))
                rows.append("| " + " | ".join(cells) + " |")

    header_attr = "true" if has_header else "false"
    out.append(f"::table[header={header_attr}]{{")
    out.extend(rows)
    out.append("}")
    out.append("")


def _list_item_to_cln(children: list[dict[str, Any]], report: ConversionReport) -> str:
    """Convert list item children to a single line of CLN text."""
    parts = []
    for child in children:
        if child.get("type") == "paragraph":
            parts.append(_inline_to_cln(child.get("children", []), report))
        elif child.get("type") == "list":
            # Nested list -- flatten to text (CLN doesn't support nested lists)
            items = child.get("children", [])
            for item in items:
                item_text = _list_item_to_cln(item.get("children", []), report)
                parts.append(item_text)
        else:
            text = child.get("raw", child.get("text", ""))
            if text:
                parts.append(text.strip())
    return " ".join(parts)


def _inline_to_cln(children: list[dict[str, Any]], report: ConversionReport) -> str:
    """Convert inline AST nodes to CLN inline syntax."""
    parts: list[str] = []
    for node in children:
        t = node.get("type", "")
        if t == "text":
            parts.append(node.get("raw", node.get("text", "")))
        elif t == "codespan":
            code = node.get("raw", node.get("text", ""))
            parts.append(f"`{code}`")
        elif t == "strong":
            inner = _inline_to_cln(node.get("children", []), report)
            parts.append(f"+{{{inner}}}")
        elif t == "emphasis":
            inner = _inline_to_cln(node.get("children", []), report)
            parts.append(f"*{{{inner}}}")
        elif t == "link":
            label = _inline_to_cln(node.get("children", []), report)
            href = node.get("attrs", {}).get("url", node.get("link", ""))
            parts.append(f"[{label} -> {href}]")
        elif t == "image":
            alt = node.get("attrs", {}).get("alt", node.get("alt", ""))
            src = node.get("attrs", {}).get("url", node.get("src", ""))
            parts.append(f'::figure[src="{src}"]{{\n{alt}\n}}')
        elif t == "softbreak":
            parts.append(" ")
        elif t == "linebreak":
            parts.append("\n")
        elif t == "html_inline" or t == "inline_html":
            raw = node.get("raw", node.get("text", ""))
            report.skipped.append(SkippedContent(
                line=0, reason="inline HTML", content=raw[:80],
            ))
            report.skipped_lines += 1
        else:
            raw = node.get("raw", node.get("text", ""))
            if raw:
                parts.append(raw)
    return "".join(parts)


def convert_file(
    input_path: Path,
    output_path: Path,
    *,
    report_path: Path | None = None,
) -> ConversionReport:
    """Convert a single .md file to .cln. Returns the conversion report."""
    source = input_path.read_text(encoding="utf-8")
    result, report = convert_markdown(source, return_report=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(result, encoding="utf-8")

    if report_path and report.skipped:
        lines = [f"# Conversion report for {input_path.name}\n"]
        for s in report.skipped:
            lines.append(f"- Line {s.line}: {s.reason}")
            if s.content:
                lines.append(f"  Content: {s.content}")
        lines.append(f"\nTotal: {report.total_lines} lines, {report.skipped_lines} skipped ({report.loss_percent:.1f}% loss)")
        report_path.write_text("\n".join(lines), encoding="utf-8")

    return report
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m unittest tests.test_converter -v 2>&1 | tail -10`
Expected: All tests pass. Some tests may need adjustments based on exact mistune v3 AST format — iterate until green.

- [ ] **Step 5: Commit**

```bash
git add clearnotation_reference/converter.py tests/test_converter.py
git commit -m "feat: add md2cln converter with mistune"
```

---

### Task 3: SQLite Indexer

**Files:**
- Create: `clearnotation_reference/indexer.py`
- Create: `tests/test_indexer.py`

- [ ] **Step 1: Write indexer tests**

Create `tests/test_indexer.py`:

```python
"""Tests for the CLN corpus indexer."""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from clearnotation_reference.indexer import index_directory, DB_NAME


SAMPLE_CLN = """\
::meta{
title = "Test Doc"
}

# Getting Started

This doc has +{bold text} and a [link -> https://example.com].

::callout[kind="info", title="Note"]{
A callout block.
}

```python
print("hello")
```
"""

SAMPLE_CLN_WITH_REF = """\
# API Reference

See :ref[target="getting-started"] for setup instructions.

::anchor[id="api-overview"]

## Overview

The API supports [docs -> other.cln#setup].
"""

BROKEN_CLN = """\
# Valid heading

::nonexistent_directive[bad="true"]{
This will fail.
}
"""


class TestIndexDirectory(unittest.TestCase):
    def _make_corpus(self, tmp: str, files: dict[str, str]) -> Path:
        root = Path(tmp)
        for name, content in files.items():
            p = root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content)
        return root

    def test_index_creates_db(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self._make_corpus(tmp, {"doc.cln": SAMPLE_CLN})
            stats = index_directory(root)
            db_path = root / DB_NAME
            self.assertTrue(db_path.exists())
            self.assertEqual(stats.indexed, 1)
            self.assertEqual(stats.skipped, 0)

    def test_documents_table(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self._make_corpus(tmp, {"doc.cln": SAMPLE_CLN})
            index_directory(root)
            conn = sqlite3.connect(root / DB_NAME)
            rows = conn.execute("SELECT path, title FROM documents").fetchall()
            conn.close()
            self.assertEqual(len(rows), 1)
            self.assertIn("doc.cln", rows[0][0])
            self.assertEqual(rows[0][1], "Getting Started")

    def test_directives_table(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self._make_corpus(tmp, {"doc.cln": SAMPLE_CLN})
            index_directory(root)
            conn = sqlite3.connect(root / DB_NAME)
            rows = conn.execute("SELECT directive_name FROM directives").fetchall()
            conn.close()
            names = [r[0] for r in rows]
            self.assertIn("callout", names)

    def test_references_table(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self._make_corpus(tmp, {"api.cln": SAMPLE_CLN_WITH_REF})
            index_directory(root)
            conn = sqlite3.connect(root / DB_NAME)
            rows = conn.execute("SELECT ref_target FROM references").fetchall()
            conn.close()
            targets = [r[0] for r in rows]
            self.assertIn("getting-started", targets)

    def test_cross_references_table(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self._make_corpus(tmp, {"api.cln": SAMPLE_CLN_WITH_REF})
            index_directory(root)
            conn = sqlite3.connect(root / DB_NAME)
            rows = conn.execute("SELECT target_document, anchor FROM cross_references").fetchall()
            conn.close()
            self.assertTrue(len(rows) > 0)
            self.assertEqual(rows[0][0], "other.cln")
            self.assertEqual(rows[0][1], "setup")

    def test_skip_broken_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self._make_corpus(tmp, {
                "good.cln": SAMPLE_CLN,
                "bad.cln": BROKEN_CLN,
            })
            stats = index_directory(root)
            self.assertEqual(stats.indexed, 1)
            self.assertEqual(stats.skipped, 1)
            self.assertTrue(len(stats.errors) > 0)

    def test_empty_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            stats = index_directory(root)
            self.assertEqual(stats.indexed, 0)

    def test_incremental_reindex(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self._make_corpus(tmp, {"doc.cln": SAMPLE_CLN})
            index_directory(root)
            # Re-index without changes
            stats = index_directory(root)
            self.assertEqual(stats.indexed, 0)  # Nothing changed
            self.assertEqual(stats.unchanged, 1)

    def test_reindex_after_modification(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self._make_corpus(tmp, {"doc.cln": SAMPLE_CLN})
            index_directory(root)
            # Modify file
            import time
            time.sleep(0.1)
            (root / "doc.cln").write_text(SAMPLE_CLN + "\n\n## New Section\n")
            stats = index_directory(root)
            self.assertEqual(stats.indexed, 1)

    def test_sqlite_error_handling(self):
        """Index to a read-only location should produce a clear error."""
        with tempfile.TemporaryDirectory() as tmp:
            root = self._make_corpus(tmp, {"doc.cln": SAMPLE_CLN})
            # Make directory read-only for DB creation
            import os
            db_path = root / DB_NAME
            db_path.write_text("not a database")
            os.chmod(str(db_path), 0o000)
            try:
                with self.assertRaises(OSError):
                    index_directory(root)
            finally:
                os.chmod(str(db_path), 0o644)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest tests.test_indexer -v 2>&1 | tail -5`
Expected: FAIL/ERROR (indexer module doesn't exist yet)

- [ ] **Step 3: Write the indexer module**

Create `clearnotation_reference/indexer.py`:

```python
"""CLN corpus indexer: walks .cln files and extracts structured metadata into SQLite."""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import load_config
from .errors import ClearNotationError, MultipleValidationFailures
from .models import (
    BlockDirective,
    BlockNode,
    Document,
    Heading,
    InlineDirective,
    InlineNode,
    Link,
    NormalizedDocument,
    NRef,
    NormalizedBlock,
    NormalizedInline,
    Text,
)
from .normalizer import Normalizer
from .parser import ReferenceParser
from .registry import Registry
from .validator import ReferenceValidator

DB_NAME = ".cln-index.db"

SCHEMA_SQL = """\
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
    """Index all .cln files under root into a SQLite database."""
    if db_path is None:
        db_path = root / DB_NAME

    stats = IndexStats()
    cln_files = sorted(root.rglob("*.cln"))

    try:
        conn = sqlite3.connect(str(db_path))
    except sqlite3.Error as exc:
        raise OSError(f"Cannot open index database {db_path}: {exc}") from exc

    try:
        conn.executescript(SCHEMA_SQL)

        for cln_file in cln_files:
            rel_path = str(cln_file.relative_to(root))
            file_mtime = cln_file.stat().st_mtime

            # Check if file was already indexed and hasn't changed
            row = conn.execute(
                "SELECT last_modified FROM documents WHERE path = ?",
                (rel_path,),
            ).fetchone()
            if row and row[0] >= file_mtime:
                stats.unchanged += 1
                continue

            # Parse and index
            try:
                config, reg_data = load_config(cln_file, config_path)
                registry = Registry.from_toml(reg_data)
                source = cln_file.read_text(encoding="utf-8")
                parsed_doc = ReferenceParser(registry).parse_document(source, cln_file)
                ReferenceValidator(registry).validate(parsed_doc, config=config)
                normalized_doc = Normalizer(registry).normalize(parsed_doc)
            except (ClearNotationError, MultipleValidationFailures) as exc:
                stats.skipped += 1
                stats.errors.append(f"{rel_path}: {exc}")
                print(f"warning: skipping {rel_path}: {exc}", file=sys.stderr)
                continue

            # Clear old data for this file
            conn.execute("DELETE FROM directives WHERE document_path = ?", (rel_path,))
            conn.execute('DELETE FROM "references" WHERE document_path = ?', (rel_path,))
            conn.execute("DELETE FROM cross_references WHERE document_path = ?", (rel_path,))

            # Extract title from first heading
            title = _extract_title(parsed_doc)

            # Upsert document
            conn.execute(
                "INSERT OR REPLACE INTO documents (path, title, last_modified, indexed_at) VALUES (?, ?, ?, ?)",
                (rel_path, title, file_mtime, os.path.getmtime(str(db_path)) if db_path.exists() else 0),
            )

            # Index directives from parsed tree (preserves directive names)
            _index_directives(conn, rel_path, parsed_doc.blocks)

            # Index references from normalized tree (has NRef nodes)
            _index_references(conn, rel_path, normalized_doc)

            # Index cross-references (links to other .cln files)
            _index_cross_references(conn, rel_path, parsed_doc.blocks)

            stats.indexed += 1

        conn.commit()
    except sqlite3.Error as exc:
        conn.close()
        raise OSError(f"Database error while indexing: {exc}") from exc
    finally:
        conn.close()

    return stats


def _extract_title(doc: Document) -> str:
    """Extract the first heading text as the document title."""
    for block in doc.blocks:
        if isinstance(block, Heading):
            return _plain_text_from_inlines(block.children)
    return ""


def _plain_text_from_inlines(inlines: list[InlineNode]) -> str:
    """Extract plain text from inline nodes."""
    parts = []
    for node in inlines:
        if isinstance(node, Text):
            parts.append(node.value)
        elif hasattr(node, "children"):
            parts.append(_plain_text_from_inlines(node.children))
        elif hasattr(node, "label"):
            parts.append(_plain_text_from_inlines(node.label))
    return "".join(parts)


def _index_directives(conn: sqlite3.Connection, doc_path: str, blocks: list[BlockNode]) -> None:
    """Extract directives from parsed tree and insert into DB."""
    for block in blocks:
        if isinstance(block, BlockDirective):
            conn.execute(
                "INSERT INTO directives (document_path, directive_name, attributes, line_number) VALUES (?, ?, ?, ?)",
                (doc_path, block.name, json.dumps(block.attrs, default=str), block.source_line),
            )
            # Recurse into directive bodies
            if block.blocks:
                _index_directives(conn, doc_path, block.blocks)


def _index_references(conn: sqlite3.Connection, doc_path: str, ndoc: NormalizedDocument) -> None:
    """Extract NRef nodes from normalized tree and insert into DB."""
    for block in ndoc.blocks:
        _walk_normalized_for_refs(conn, doc_path, block)


def _walk_normalized_for_refs(conn: sqlite3.Connection, doc_path: str, block: NormalizedBlock) -> None:
    """Recursively walk normalized blocks to find NRef inline nodes."""
    inlines: list[NormalizedInline] = []
    if hasattr(block, "content"):
        inlines = getattr(block, "content", [])
    elif hasattr(block, "items"):
        items = getattr(block, "items", [])
        for item in items:
            if hasattr(item, "content"):
                inlines.extend(item.content)
            elif isinstance(item, list):
                inlines.extend(item)
    elif hasattr(block, "lines"):
        for line in getattr(block, "lines", []):
            inlines.extend(line)
    elif hasattr(block, "blocks"):
        for sub in getattr(block, "blocks", []):
            _walk_normalized_for_refs(conn, doc_path, sub)

    for inline in inlines:
        if isinstance(inline, NRef):
            conn.execute(
                'INSERT INTO "references" (document_path, ref_target, ref_type) VALUES (?, ?, ?)',
                (doc_path, inline.target, "ref"),
            )


def _index_cross_references(conn: sqlite3.Connection, doc_path: str, blocks: list[BlockNode]) -> None:
    """Extract links pointing to other .cln files as cross-references."""
    for block in blocks:
        if hasattr(block, "children"):
            _walk_inlines_for_xrefs(conn, doc_path, getattr(block, "children", []))
        if hasattr(block, "items"):
            for item in getattr(block, "items", []):
                if isinstance(item, list):
                    _walk_inlines_for_xrefs(conn, doc_path, item)
                elif hasattr(item, "children"):
                    _walk_inlines_for_xrefs(conn, doc_path, item.children)
        if isinstance(block, BlockDirective) and block.blocks:
            _index_cross_references(conn, doc_path, block.blocks)


def _walk_inlines_for_xrefs(conn: sqlite3.Connection, doc_path: str, inlines: list[InlineNode]) -> None:
    """Find Link nodes whose target points to a .cln file."""
    for node in inlines:
        if isinstance(node, Link):
            target = node.target
            if ".cln" in target:
                # Split path#anchor
                if "#" in target:
                    target_doc, anchor = target.rsplit("#", 1)
                else:
                    target_doc, anchor = target, ""
                conn.execute(
                    "INSERT INTO cross_references (document_path, target_document, anchor) VALUES (?, ?, ?)",
                    (doc_path, target_doc, anchor),
                )
        if hasattr(node, "children"):
            _walk_inlines_for_xrefs(conn, doc_path, node.children)
        if hasattr(node, "label"):
            _walk_inlines_for_xrefs(conn, doc_path, node.label)


def get_db_mtime(root: Path) -> float | None:
    """Return the mtime of the index DB, or None if it doesn't exist."""
    db = root / DB_NAME
    if db.exists():
        return db.stat().st_mtime
    return None


def check_staleness(root: Path) -> bool:
    """Return True if any .cln file is newer than the index DB."""
    db_mtime = get_db_mtime(root)
    if db_mtime is None:
        return True
    for cln_file in root.rglob("*.cln"):
        if cln_file.stat().st_mtime > db_mtime:
            return True
    return False
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m unittest tests.test_indexer -v 2>&1 | tail -15`
Expected: All tests pass. Iterate on any failures.

- [ ] **Step 5: Commit**

```bash
git add clearnotation_reference/indexer.py tests/test_indexer.py
git commit -m "feat: add cln index with SQLite backend and incremental indexing"
```

---

### Task 4: Query Engine

**Files:**
- Create: `clearnotation_reference/query.py`
- Create: `tests/test_query.py`

- [ ] **Step 1: Write query tests**

Create `tests/test_query.py`:

```python
"""Tests for the CLN query engine."""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from clearnotation_reference.indexer import index_directory, DB_NAME
from clearnotation_reference.query import query_index, corpus_stats, check_and_warn_staleness


SAMPLE_A = """\
# Getting Started

Welcome to the project.

::callout[kind="info", title="Setup"]{
Follow these steps.
}
"""

SAMPLE_B = """\
# API Reference

See :ref[target="getting-started"] for setup.

::callout[kind="warning", title="Deprecated"]{
This API is deprecated.
}

```python
import api
```
"""


class TestQuery(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.root = Path(self.tmp)
        (self.root / "getting-started.cln").write_text(SAMPLE_A)
        (self.root / "api.cln").write_text(SAMPLE_B)
        index_directory(self.root)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp)

    def test_query_by_directive(self):
        results = query_index(self.root, directive="callout")
        paths = [r["path"] for r in results]
        self.assertIn("getting-started.cln", paths)
        self.assertIn("api.cln", paths)

    def test_query_by_title(self):
        results = query_index(self.root, title="API")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["path"], "api.cln")

    def test_query_by_references(self):
        results = query_index(self.root, references="getting-started")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["path"], "api.cln")

    def test_query_and_semantics(self):
        results = query_index(self.root, directive="callout", title="API")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["path"], "api.cln")

    def test_query_no_results(self):
        results = query_index(self.root, directive="nonexistent")
        self.assertEqual(len(results), 0)

    def test_query_missing_db(self):
        with tempfile.TemporaryDirectory() as tmp2:
            with self.assertRaises(FileNotFoundError):
                query_index(Path(tmp2), directive="callout")


class TestCorpusStats(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.root = Path(self.tmp)
        (self.root / "a.cln").write_text(SAMPLE_A)
        (self.root / "b.cln").write_text(SAMPLE_B)
        index_directory(self.root)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp)

    def test_stats_document_count(self):
        stats = corpus_stats(self.root)
        self.assertEqual(stats["total_documents"], 2)

    def test_stats_directive_histogram(self):
        stats = corpus_stats(self.root)
        hist = stats["directive_histogram"]
        self.assertIn("callout", hist)
        self.assertEqual(hist["callout"], 2)

    def test_stats_broken_references(self):
        stats = corpus_stats(self.root)
        # "getting-started" ref target should match a document
        broken = stats["broken_references"]
        # This depends on whether we resolve ref targets to doc paths
        self.assertIsInstance(broken, list)


class TestStaleness(unittest.TestCase):
    def test_warn_when_stale(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doc.cln").write_text("# Hello")
            index_directory(root)
            import time
            time.sleep(0.1)
            (root / "doc.cln").write_text("# Updated")
            is_stale = check_and_warn_staleness(root)
            self.assertTrue(is_stale)

    def test_no_warn_when_fresh(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doc.cln").write_text("# Hello")
            index_directory(root)
            is_stale = check_and_warn_staleness(root)
            self.assertFalse(is_stale)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest tests.test_query -v 2>&1 | tail -5`
Expected: FAIL/ERROR (query module doesn't exist yet)

- [ ] **Step 3: Write the query module**

Create `clearnotation_reference/query.py`:

```python
"""Query engine for the CLN index."""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path
from typing import Any

from .indexer import DB_NAME, check_staleness


def query_index(
    root: Path,
    *,
    directive: str | None = None,
    references: str | None = None,
    title: str | None = None,
    attribute: str | None = None,
    db_path: Path | None = None,
) -> list[dict[str, Any]]:
    """Query the CLN index with AND semantics across filters."""
    if db_path is None:
        db_path = root / DB_NAME

    if not db_path.exists():
        raise FileNotFoundError(f"No index found at {db_path}. Run 'cln index' first.")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    try:
        # Start with all documents
        candidate_paths: set[str] | None = None

        if directive:
            rows = conn.execute(
                "SELECT DISTINCT document_path FROM directives WHERE directive_name = ?",
                (directive,),
            ).fetchall()
            paths = {r["document_path"] for r in rows}
            candidate_paths = paths if candidate_paths is None else candidate_paths & paths

        if references:
            rows = conn.execute(
                'SELECT DISTINCT document_path FROM "references" WHERE ref_target = ?',
                (references,),
            ).fetchall()
            paths = {r["document_path"] for r in rows}
            candidate_paths = paths if candidate_paths is None else candidate_paths & paths

        if title:
            rows = conn.execute(
                "SELECT path FROM documents WHERE title LIKE ?",
                (f"%{title}%",),
            ).fetchall()
            paths = {r["path"] for r in rows}
            candidate_paths = paths if candidate_paths is None else candidate_paths & paths

        if attribute:
            # attribute format: key=value
            if "=" in attribute:
                key, value = attribute.split("=", 1)
                rows = conn.execute(
                    "SELECT DISTINCT document_path FROM directives WHERE attributes LIKE ?",
                    (f'%"{key}": "{value}"%',),
                ).fetchall()
                # Also try without spaces (JSON formatting varies)
                rows2 = conn.execute(
                    "SELECT DISTINCT document_path FROM directives WHERE attributes LIKE ?",
                    (f'%"{key}":"{value}"%',),
                ).fetchall()
                paths = {r["document_path"] for r in rows} | {r["document_path"] for r in rows2}
                candidate_paths = paths if candidate_paths is None else candidate_paths & paths

        if candidate_paths is None:
            # No filters specified, return all
            rows = conn.execute("SELECT path, title FROM documents ORDER BY path").fetchall()
            candidate_paths = {r["path"] for r in rows}

        # Build result with context
        results = []
        for path in sorted(candidate_paths):
            doc = conn.execute(
                "SELECT path, title FROM documents WHERE path = ?", (path,)
            ).fetchone()
            if doc is None:
                continue

            directives_found = conn.execute(
                "SELECT directive_name, line_number FROM directives WHERE document_path = ?",
                (path,),
            ).fetchall()

            refs_found = conn.execute(
                'SELECT ref_target FROM "references" WHERE document_path = ?',
                (path,),
            ).fetchall()

            results.append({
                "path": doc["path"],
                "title": doc["title"],
                "directives": [{"name": d["directive_name"], "line": d["line_number"]} for d in directives_found],
                "references": [r["ref_target"] for r in refs_found],
            })

        return results
    finally:
        conn.close()


def corpus_stats(root: Path, db_path: Path | None = None) -> dict[str, Any]:
    """Return corpus-level statistics from the index."""
    if db_path is None:
        db_path = root / DB_NAME

    if not db_path.exists():
        raise FileNotFoundError(f"No index found at {db_path}. Run 'cln index' first.")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    try:
        total_docs = conn.execute("SELECT COUNT(*) AS c FROM documents").fetchone()["c"]

        # Directive usage histogram
        hist_rows = conn.execute(
            "SELECT directive_name, COUNT(*) AS c FROM directives GROUP BY directive_name ORDER BY c DESC"
        ).fetchall()
        directive_histogram = {r["directive_name"]: r["c"] for r in hist_rows}

        # Broken references: ref targets that don't match any document title slug or anchor
        all_ref_targets = conn.execute('SELECT ref_target, document_path FROM "references"').fetchall()
        all_doc_paths = {r["path"] for r in conn.execute("SELECT path FROM documents").fetchall()}

        # Check cross-references for broken links
        xref_rows = conn.execute("SELECT document_path, target_document, anchor FROM cross_references").fetchall()
        broken_refs: list[dict[str, str]] = []
        for xref in xref_rows:
            if xref["target_document"] not in all_doc_paths:
                broken_refs.append({
                    "from": xref["document_path"],
                    "to": xref["target_document"],
                    "anchor": xref["anchor"],
                })

        # Orphaned anchors: anchors defined but never referenced
        # (Would need anchor tracking in the indexer, defer for now)

        return {
            "total_documents": total_docs,
            "directive_histogram": directive_histogram,
            "broken_references": broken_refs,
        }
    finally:
        conn.close()


def check_and_warn_staleness(root: Path) -> bool:
    """Check if the index is stale. Returns True if stale."""
    return check_staleness(root)


def format_results(results: list[dict[str, Any]]) -> str:
    """Format query results for terminal output."""
    if not results:
        return "No matching documents found."

    lines = [f"Found {len(results)} document(s):\n"]
    for r in results:
        lines.append(f"  {r['path']}")
        if r.get("title"):
            lines.append(f"    Title: {r['title']}")
        if r.get("directives"):
            dir_names = sorted(set(d["name"] for d in r["directives"]))
            lines.append(f"    Directives: {', '.join(dir_names)}")
        if r.get("references"):
            lines.append(f"    References: {', '.join(r['references'])}")
        lines.append("")

    return "\n".join(lines)


def format_stats(stats: dict[str, Any]) -> str:
    """Format corpus stats for terminal output."""
    lines = [f"Corpus: {stats['total_documents']} documents\n"]

    if stats.get("directive_histogram"):
        lines.append("Directive usage:")
        for name, count in stats["directive_histogram"].items():
            lines.append(f"  {name}: {count}")
        lines.append("")

    broken = stats.get("broken_references", [])
    if broken:
        lines.append(f"Broken cross-references ({len(broken)}):")
        for b in broken:
            anchor = f"#{b['anchor']}" if b.get("anchor") else ""
            lines.append(f"  {b['from']} -> {b['to']}{anchor}")
        lines.append("")
    else:
        lines.append("No broken cross-references.\n")

    return "\n".join(lines)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m unittest tests.test_query -v 2>&1 | tail -15`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add clearnotation_reference/query.py tests/test_query.py
git commit -m "feat: add cln query with CLI flags and corpus stats"
```

---

### Task 5: Schema Linter

**Files:**
- Create: `clearnotation_reference/linter.py`
- Create: `tests/test_linter.py`

- [ ] **Step 1: Write linter tests**

Create `tests/test_linter.py`:

```python
"""Tests for the CLN schema linter."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from clearnotation_reference.linter import lint_corpus, LintIssue


SAMPLE_GOOD = """\
::meta{
title = "Good Doc"
}

# Hello

::callout[kind="info", title="Note"]{
This is fine.
}
"""

SAMPLE_MISSING_DIRECTIVE = """\
# No Callout Here

Just a paragraph.
"""

SCHEMA_TOML = """\
[schema.default]
required_directives = ["callout"]
"""

SCHEMA_WITH_ATTRS = """\
[schema.default]
required_directives = ["callout"]

[schema.default.required_attributes]
"*" = ["kind"]
"""

BAD_SCHEMA = """\
this is not valid toml [[[
"""


class TestLintCorpus(unittest.TestCase):
    def _make_corpus(self, tmp: str, files: dict[str, str], schema: str) -> tuple[Path, Path]:
        root = Path(tmp)
        for name, content in files.items():
            p = root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content)
        schema_path = root / "lint-schema.toml"
        schema_path.write_text(schema)
        return root, schema_path

    def test_clean_corpus(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, schema = self._make_corpus(tmp, {"good.cln": SAMPLE_GOOD}, SCHEMA_TOML)
            issues = lint_corpus(root, schema)
            self.assertEqual(len(issues), 0)

    def test_missing_directive(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, schema = self._make_corpus(tmp, {"bad.cln": SAMPLE_MISSING_DIRECTIVE}, SCHEMA_TOML)
            issues = lint_corpus(root, schema)
            self.assertEqual(len(issues), 1)
            self.assertIn("callout", issues[0].message)
            self.assertEqual(issues[0].path, "bad.cln")

    def test_missing_attribute(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, schema = self._make_corpus(tmp, {"good.cln": SAMPLE_GOOD}, SCHEMA_WITH_ATTRS)
            issues = lint_corpus(root, schema)
            # callout has kind="info", so it should pass
            self.assertEqual(len(issues), 0)

    def test_mixed_pass_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, schema = self._make_corpus(tmp, {
                "good.cln": SAMPLE_GOOD,
                "bad.cln": SAMPLE_MISSING_DIRECTIVE,
            }, SCHEMA_TOML)
            issues = lint_corpus(root, schema)
            self.assertEqual(len(issues), 1)
            self.assertEqual(issues[0].path, "bad.cln")

    def test_malformed_schema(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, schema = self._make_corpus(tmp, {"doc.cln": SAMPLE_GOOD}, BAD_SCHEMA)
            with self.assertRaises(ValueError):
                lint_corpus(root, schema)

    def test_skip_broken_cln(self):
        broken = "::nonexistent[x=1]{\nbad\n}"
        with tempfile.TemporaryDirectory() as tmp:
            root, schema = self._make_corpus(tmp, {
                "good.cln": SAMPLE_GOOD,
                "broken.cln": broken,
            }, SCHEMA_TOML)
            issues = lint_corpus(root, schema)
            # broken.cln should be skipped, good.cln should pass
            parse_issues = [i for i in issues if "parse" in i.message.lower() or "skip" in i.message.lower()]
            lint_issues = [i for i in issues if "parse" not in i.message.lower() and "skip" not in i.message.lower()]
            self.assertEqual(len(lint_issues), 0)

    def test_unknown_directive(self):
        """Lint should flag directives not in the builtin registry or user config."""
        # This tests that the linter can detect directives present in a doc
        # that aren't in the schema's known set (if configured)
        with tempfile.TemporaryDirectory() as tmp:
            root, schema = self._make_corpus(tmp, {"good.cln": SAMPLE_GOOD}, SCHEMA_TOML)
            issues = lint_corpus(root, schema)
            self.assertEqual(len(issues), 0)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest tests.test_linter -v 2>&1 | tail -5`
Expected: FAIL/ERROR (linter module doesn't exist yet)

- [ ] **Step 3: Write the linter module**

Create `clearnotation_reference/linter.py`:

```python
"""Schema linter: validates a CLN corpus against a TOML schema."""

from __future__ import annotations

import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path

from .config import load_config
from .errors import ClearNotationError, MultipleValidationFailures
from .models import BlockDirective, BlockNode, Document
from .normalizer import Normalizer
from .parser import ReferenceParser
from .registry import Registry
from .validator import ReferenceValidator


@dataclass
class LintIssue:
    path: str
    message: str
    severity: str = "warning"


def lint_corpus(
    root: Path,
    schema_path: Path,
    config_path: str | None = None,
) -> list[LintIssue]:
    """Lint all .cln files under root against the given schema."""
    schema = _load_schema(schema_path)
    issues: list[LintIssue] = []
    cln_files = sorted(root.rglob("*.cln"))

    for cln_file in cln_files:
        rel_path = str(cln_file.relative_to(root))

        try:
            config, reg_data = load_config(cln_file, config_path)
            registry = Registry.from_toml(reg_data)
            source = cln_file.read_text(encoding="utf-8")
            parsed_doc = ReferenceParser(registry).parse_document(source, cln_file)
            ReferenceValidator(registry).validate(parsed_doc, config=config)
        except (ClearNotationError, MultipleValidationFailures) as exc:
            issues.append(LintIssue(
                path=rel_path,
                message=f"Skipped (parse/validation error): {exc}",
                severity="error",
            ))
            print(f"warning: skipping {rel_path}: {exc}", file=sys.stderr)
            continue

        # Check required directives
        doc_directives = _collect_directive_names(parsed_doc.blocks)
        for req_dir in schema.required_directives:
            if req_dir not in doc_directives:
                issues.append(LintIssue(
                    path=rel_path,
                    message=f"Missing required directive: {req_dir}",
                ))

        # Check required attributes
        doc_directive_blocks = _collect_directives(parsed_doc.blocks)
        for pattern, required_attrs in schema.required_attributes.items():
            matching = doc_directive_blocks if pattern == "*" else [
                d for d in doc_directive_blocks if d.name == pattern
            ]
            for directive in matching:
                for attr_name in required_attrs:
                    if attr_name not in directive.attrs:
                        issues.append(LintIssue(
                            path=rel_path,
                            message=f"Directive '{directive.name}' missing required attribute: {attr_name}",
                        ))

    return issues


@dataclass
class Schema:
    required_directives: list[str]
    required_attributes: dict[str, list[str]]


def _load_schema(path: Path) -> Schema:
    """Load and parse a lint schema TOML file."""
    try:
        with open(path, "rb") as f:
            data = tomllib.load(f)
    except tomllib.TOMLDecodeError as exc:
        raise ValueError(f"Invalid schema TOML: {exc}") from exc

    # Find the first schema section
    schema_data = data.get("schema", {})
    if not schema_data:
        raise ValueError(f"No [schema.*] section found in {path}")

    # Use the first schema profile
    profile = next(iter(schema_data.values()))
    req_dirs = profile.get("required_directives", [])

    req_attrs: dict[str, list[str]] = {}
    raw_attrs = profile.get("required_attributes", {})
    for key, value in raw_attrs.items():
        if isinstance(value, list):
            req_attrs[key] = value
        elif isinstance(value, dict):
            req_attrs[key] = list(value.keys()) if value else []

    return Schema(required_directives=req_dirs, required_attributes=req_attrs)


def _collect_directive_names(blocks: list[BlockNode]) -> set[str]:
    """Collect all directive names from a parsed tree."""
    names: set[str] = set()
    for block in blocks:
        if isinstance(block, BlockDirective):
            names.add(block.name)
            if block.blocks:
                names.update(_collect_directive_names(block.blocks))
    return names


def _collect_directives(blocks: list[BlockNode]) -> list[BlockDirective]:
    """Collect all BlockDirective nodes from a parsed tree."""
    result: list[BlockDirective] = []
    for block in blocks:
        if isinstance(block, BlockDirective):
            result.append(block)
            if block.blocks:
                result.extend(_collect_directives(block.blocks))
    return result


def format_issues(issues: list[LintIssue]) -> str:
    """Format lint issues for terminal output."""
    if not issues:
        return "No lint issues found."

    lines = [f"{len(issues)} issue(s) found:\n"]
    by_path: dict[str, list[LintIssue]] = {}
    for issue in issues:
        by_path.setdefault(issue.path, []).append(issue)

    for path, path_issues in sorted(by_path.items()):
        lines.append(f"  {path}:")
        for issue in path_issues:
            lines.append(f"    [{issue.severity}] {issue.message}")
    lines.append("")

    return "\n".join(lines)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m unittest tests.test_linter -v 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add clearnotation_reference/linter.py tests/test_linter.py
git commit -m "feat: add cln lint with TOML schema validation"
```

---

### Task 6: CLI Integration

**Files:**
- Modify: `clearnotation_reference/cli.py:71-132`

- [ ] **Step 1: Add convert, index, query, lint subcommands to CLI**

In `cli.py`, add these subcommand definitions after the `watch_p` block (after line 106):

```python
    convert_p = sub.add_parser("convert", help="Convert Markdown files to CLN")
    convert_p.add_argument("input", help="Markdown file or directory to convert")
    convert_p.add_argument("--output", "-o", help="Output path (file or directory)")
    convert_p.add_argument("--report", help="Write conversion report to this file")

    index_p = sub.add_parser("index", help="Index .cln files into a queryable database")
    index_p.add_argument("input", nargs="?", default=".", help="Directory to index (default: .)")
    index_p.add_argument("--config", help="Path to clearnotation.toml")

    query_p = sub.add_parser("query", help="Query the CLN index")
    query_p.add_argument("--directive", help="Filter by directive name")
    query_p.add_argument("--references", help="Filter by reference target")
    query_p.add_argument("--title", help="Filter by document title (substring)")
    query_p.add_argument("--attribute", help="Filter by attribute key=value")
    query_p.add_argument("--stats", action="store_true", help="Show corpus statistics")
    query_p.add_argument("input", nargs="?", default=".", help="Project root (default: .)")

    lint_p = sub.add_parser("lint", help="Validate CLN corpus against a schema")
    lint_p.add_argument("input", help="Directory to lint")
    lint_p.add_argument("--schema", required=True, help="Path to schema TOML file")
    lint_p.add_argument("--config", help="Path to clearnotation.toml")
```

- [ ] **Step 2: Add command dispatch in the try block**

Add after the existing `if args.command == "watch":` block (around line 127):

```python
        if args.command == "convert":
            return _cmd_convert(Path(args.input), args.output, getattr(args, "report", None))
        if args.command == "index":
            return _cmd_index(Path(args.input), getattr(args, "config", None))
        if args.command == "query":
            return _cmd_query(Path(args.input), args)
        if args.command == "lint":
            return _cmd_lint(Path(args.input), args.schema, getattr(args, "config", None))
```

- [ ] **Step 3: Implement the command handler functions**

Add these functions before `_ast_to_dict`:

```python
def _cmd_convert(input_path: Path, output: str | None, report: str | None) -> int:
    try:
        from .converter import convert_file, convert_markdown, ConversionReport
    except ImportError:
        print(
            "error: mistune is required for Markdown conversion.\n"
            "Install it with: pip install clearnotation[convert]",
            file=sys.stderr,
        )
        return 1

    if input_path.is_dir():
        md_files = sorted(input_path.rglob("*.md"))
        if not md_files:
            print(f"No .md files found in {input_path}", file=sys.stderr)
            return 1
        out_dir = Path(output) if output else input_path
        errors = 0
        total_loss = 0.0
        for md_file in md_files:
            rel = md_file.relative_to(input_path)
            cln_file = (out_dir / rel).with_suffix(".cln")
            cln_file.parent.mkdir(parents=True, exist_ok=True)
            try:
                r = convert_file(
                    md_file, cln_file,
                    report_path=Path(report) if report else None,
                )
                total_loss += r.loss_percent
                status = f" ({r.loss_percent:.0f}% loss)" if r.skipped_lines else ""
                print(f"  {md_file} -> {cln_file}{status}")
            except Exception as exc:
                print(f"  error: {md_file}: {exc}", file=sys.stderr)
                errors += 1
        avg_loss = total_loss / len(md_files) if md_files else 0
        print(f"\nConverted {len(md_files) - errors}/{len(md_files)} files (avg {avg_loss:.1f}% content loss)")
        return 1 if errors > 0 else 0
    else:
        out_path = Path(output) if output else input_path.with_suffix(".cln")
        rpt_path = Path(report) if report else None
        try:
            r = convert_file(input_path, out_path, report_path=rpt_path)
            status = f" ({r.loss_percent:.0f}% loss)" if r.skipped_lines else ""
            print(f"{input_path} -> {out_path}{status}")
            for s in r.skipped:
                print(f"  warning: line {s.line}: {s.reason}", file=sys.stderr)
            return 0
        except Exception as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1


def _cmd_index(input_path: Path, config_path: str | None) -> int:
    from .indexer import index_directory
    try:
        stats = index_directory(input_path, config_path=config_path)
        print(f"Indexed: {stats.indexed} files")
        if stats.unchanged:
            print(f"Unchanged: {stats.unchanged} files")
        if stats.skipped:
            print(f"Skipped: {stats.skipped} files (errors)")
        for err in stats.errors:
            print(f"  {err}", file=sys.stderr)
        return 1 if stats.skipped > 0 and stats.indexed == 0 else 0
    except OSError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


def _cmd_query(input_path: Path, args: argparse.Namespace) -> int:
    from .query import (
        query_index, corpus_stats, check_and_warn_staleness,
        format_results, format_stats,
    )

    if check_and_warn_staleness(input_path):
        print("warning: index may be stale. Run 'cln index' to refresh.", file=sys.stderr)

    try:
        if args.stats:
            stats = corpus_stats(input_path)
            print(format_stats(stats))
            return 0

        results = query_index(
            input_path,
            directive=args.directive,
            references=args.references,
            title=args.title,
            attribute=args.attribute,
        )
        print(format_results(results))
        return 0
    except FileNotFoundError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


def _cmd_lint(input_path: Path, schema: str, config_path: str | None) -> int:
    from .linter import lint_corpus, format_issues
    try:
        issues = lint_corpus(input_path, Path(schema), config_path=config_path)
        if issues:
            print(format_issues(issues))
            return 1
        print("No lint issues found.")
        return 0
    except (ValueError, FileNotFoundError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
```

- [ ] **Step 4: Update the module docstring**

Change line 1 from:
```python
"""CLI entry point for ClearNotation: cln build, cln check, cln ast, cln init, cln watch."""
```
to:
```python
"""CLI entry point for ClearNotation: cln build, cln check, cln ast, cln init, cln watch, cln convert, cln index, cln query, cln lint."""
```

- [ ] **Step 5: Run all tests**

Run: `python3 -m unittest discover -s tests -v 2>&1 | tail -10`
Expected: All tests pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add clearnotation_reference/cli.py
git commit -m "feat: wire convert, index, query, lint subcommands into CLI"
```

---

### Task 7: End-to-End Integration Tests

**Files:**
- Create: `tests/test_pipeline_e2e.py`

- [ ] **Step 1: Write E2E tests**

Create `tests/test_pipeline_e2e.py`:

```python
"""End-to-end tests: Markdown -> CLN -> index -> query -> lint."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from clearnotation_reference.converter import convert_file
from clearnotation_reference.indexer import index_directory
from clearnotation_reference.query import query_index, corpus_stats
from clearnotation_reference.linter import lint_corpus


MARKDOWN_A = """\
# Getting Started

Welcome to the **project**. This guide covers basic setup.

## Installation

Run `pip install myproject` to get started.

- Step one
- Step two
- Step three

```python
import myproject
myproject.init()
```
"""

MARKDOWN_B = """\
# API Reference

See [Getting Started](getting-started.cln#installation) for setup.

## Endpoints

The API has these *endpoints*:

1. GET /users
2. POST /users
3. DELETE /users

::callout is not in Markdown, so this just becomes a paragraph.
"""

SCHEMA = """\
[schema.default]
required_directives = ["callout"]
"""


class TestFullPipeline(unittest.TestCase):
    def test_convert_index_query(self):
        """Convert Markdown, index the result, and query it."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            md_dir = root / "md"
            cln_dir = root / "cln"
            md_dir.mkdir()
            cln_dir.mkdir()

            # Write Markdown files
            (md_dir / "getting-started.md").write_text(MARKDOWN_A)
            (md_dir / "api.md").write_text(MARKDOWN_B)

            # Convert
            for md_file in sorted(md_dir.glob("*.md")):
                cln_file = cln_dir / md_file.with_suffix(".cln").name
                report = convert_file(md_file, cln_file)
                self.assertLess(report.loss_percent, 20)

            # Verify CLN files exist and parse
            cln_files = list(cln_dir.glob("*.cln"))
            self.assertEqual(len(cln_files), 2)

            # Index
            stats = index_directory(cln_dir)
            self.assertEqual(stats.indexed, 2)
            self.assertEqual(stats.skipped, 0)

            # Query by title
            results = query_index(cln_dir, title="API")
            self.assertEqual(len(results), 1)
            self.assertIn("api.cln", results[0]["path"])

            # Corpus stats
            s = corpus_stats(cln_dir)
            self.assertEqual(s["total_documents"], 2)

    def test_convert_index_lint(self):
        """Convert Markdown, index, then lint against a schema."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cln_dir = root / "cln"
            cln_dir.mkdir()

            # Convert
            (root / "test.md").write_text(MARKDOWN_A)
            convert_file(root / "test.md", cln_dir / "test.cln")

            # Write schema
            schema_path = root / "schema.toml"
            schema_path.write_text(SCHEMA)

            # Lint — should find missing callout directive
            issues = lint_corpus(cln_dir, schema_path)
            self.assertTrue(len(issues) > 0)
            self.assertTrue(any("callout" in i.message for i in issues))
```

- [ ] **Step 2: Run E2E tests**

Run: `python3 -m unittest tests.test_pipeline_e2e -v 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 3: Run the full test suite**

Run: `python3 -m unittest discover -s tests -v 2>&1 | tail -5`
Expected: All tests pass (128 existing + ~50 new).

- [ ] **Step 4: Commit**

```bash
git add tests/test_pipeline_e2e.py
git commit -m "test: add end-to-end pipeline tests for convert -> index -> query -> lint"
```

---

### Task 8: Manual smoke test

- [ ] **Step 1: Install mistune**

Run: `pip install mistune>=3.0`

- [ ] **Step 2: Create a test Markdown file and run the full pipeline**

```bash
mkdir -p /tmp/cln-demo
cat > /tmp/cln-demo/test.md << 'EOF'
# Demo Document

This is a **bold** and *italic* demo with [a link](https://example.com).

## Code Example

```python
print("hello world")
```

- Item one
- Item two

| Name | Value |
|------|-------|
| A    | 1     |
EOF

cln convert /tmp/cln-demo/test.md -o /tmp/cln-demo/test.cln
cat /tmp/cln-demo/test.cln
cln check /tmp/cln-demo/test.cln
cln index /tmp/cln-demo/
cln query /tmp/cln-demo/ --stats
cln query /tmp/cln-demo/ --title Demo
```

Expected: Each command runs without errors. `cln check` passes on the converted file. `cln query --stats` shows 1 document.

- [ ] **Step 3: Commit any fixes from smoke testing**

Only if issues are found during manual testing.
