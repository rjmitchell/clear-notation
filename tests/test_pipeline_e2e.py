"""End-to-end integration tests for the full pipeline.

Exercises: Markdown → convert_file → index_directory → query_index / lint_corpus
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from clearnotation_reference.converter import convert_file
from clearnotation_reference.indexer import index_directory
from clearnotation_reference.query import corpus_stats, query_index
from clearnotation_reference.linter import lint_corpus

# ---------------------------------------------------------------------------
# Sample Markdown documents
# ---------------------------------------------------------------------------

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
"""

SCHEMA = """\
[schema.default]
required_directives = ["callout"]
"""


class TestConvertIndexQuery(unittest.TestCase):
    """Full pipeline: convert Markdown → index → query → stats."""

    def test_convert_index_query(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            # Step 1: Write Markdown source files
            md_a = root / "getting-started.md"
            md_b = root / "api-reference.md"
            md_a.write_text(MARKDOWN_A, encoding="utf-8")
            md_b.write_text(MARKDOWN_B, encoding="utf-8")

            # Step 2: Convert each to .cln
            cln_a = root / "getting-started.cln"
            cln_b = root / "api-reference.cln"
            report_a = convert_file(md_a, cln_a)
            report_b = convert_file(md_b, cln_b)

            # Step 3: Verify content loss < 20%
            self.assertLess(
                report_a.loss_percent,
                20.0,
                msg=f"getting-started.md lost {report_a.loss_percent:.1f}% of content",
            )
            self.assertLess(
                report_b.loss_percent,
                20.0,
                msg=f"api-reference.md lost {report_b.loss_percent:.1f}% of content",
            )

            # Verify .cln files were actually written
            self.assertTrue(cln_a.exists())
            self.assertTrue(cln_b.exists())

            # Step 4: Index the .cln directory
            stats = index_directory(root)

            # Step 5: Verify 2 files were indexed
            self.assertEqual(
                stats.indexed,
                2,
                msg=f"Expected 2 indexed, got {stats.indexed}; errors: {stats.errors}",
            )

            # Step 6: Query by title "API" → should return exactly 1 result
            results = query_index(root, title="API")
            self.assertEqual(len(results), 1)
            self.assertIn("api-reference.cln", results[0]["path"])

            # Step 7: corpus_stats should report 2 documents
            corpus = corpus_stats(root)
            self.assertEqual(corpus["total_documents"], 2)


class TestConvertIndexLint(unittest.TestCase):
    """Convert Markdown then lint against a schema requiring a missing directive."""

    def test_convert_index_lint(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            # Step 1: Write a Markdown file with paragraphs and code but NO callout
            md_path = root / "guide.md"
            md_path.write_text(MARKDOWN_A, encoding="utf-8")

            # Step 2: Convert to .cln
            cln_path = root / "guide.cln"
            convert_file(md_path, cln_path)
            self.assertTrue(cln_path.exists())

            # Confirm the output contains no callout directive
            cln_text = cln_path.read_text(encoding="utf-8")
            self.assertNotIn("::callout", cln_text)

            # Step 3: Write a schema TOML requiring the "callout" directive
            schema_path = root / "schema.toml"
            schema_path.write_text(SCHEMA, encoding="utf-8")

            # Step 4: Run lint_corpus → should find a missing-directive issue
            issues = lint_corpus(root, schema_path)

            self.assertTrue(
                len(issues) > 0,
                msg="Expected at least one lint issue for missing 'callout' directive",
            )
            messages = " ".join(i.message for i in issues)
            self.assertIn("callout", messages)

            # The offending path should be guide.cln
            paths = [i.path for i in issues]
            self.assertIn("guide.cln", paths)


if __name__ == "__main__":
    unittest.main()
