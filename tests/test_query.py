"""Tests for the query engine."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from clearnotation_reference.indexer import DB_NAME, index_directory
from clearnotation_reference.query import (
    check_and_warn_staleness,
    corpus_stats,
    format_results,
    format_stats,
    query_index,
)

SAMPLE_A = """\
# Getting Started

Welcome to the project.

::callout[kind="info", title="Setup"]{
Follow these steps.
}
"""

SAMPLE_B = """\
# API Reference

::anchor[id="api-overview"]

See ::ref[target="api-overview"] for setup.

::callout[kind="warning", title="Deprecated"]{
This API is deprecated.
}

```python
import api
```
"""

SAMPLE_C = """\
# Tutorial

A tutorial with a [link -> other.cln#setup].

::figure[src="img.png"]{
A figure caption.
}
"""


class TestQueryByDirective(unittest.TestCase):
    def test_query_by_directive(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.cln").write_text(SAMPLE_A)
            (root / "b.cln").write_text(SAMPLE_B)
            index_directory(root)

            results = query_index(root, directive="callout")
            paths = [r["path"] for r in results]
            self.assertIn("a.cln", paths)
            self.assertIn("b.cln", paths)

    def test_query_by_directive_specific(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.cln").write_text(SAMPLE_A)
            (root / "c.cln").write_text(SAMPLE_C)
            index_directory(root)

            results = query_index(root, directive="figure")
            paths = [r["path"] for r in results]
            self.assertIn("c.cln", paths)
            self.assertNotIn("a.cln", paths)


class TestQueryByTitle(unittest.TestCase):
    def test_query_by_title(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.cln").write_text(SAMPLE_A)
            (root / "b.cln").write_text(SAMPLE_B)
            index_directory(root)

            results = query_index(root, title="API")
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0]["path"], "b.cln")

    def test_query_by_title_substring(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.cln").write_text(SAMPLE_A)
            (root / "b.cln").write_text(SAMPLE_B)
            index_directory(root)

            results = query_index(root, title="Started")
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0]["path"], "a.cln")


class TestQueryByReferences(unittest.TestCase):
    def test_query_by_references(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.cln").write_text(SAMPLE_A)
            (root / "b.cln").write_text(SAMPLE_B)
            index_directory(root)

            results = query_index(root, references="api-overview")
            paths = [r["path"] for r in results]
            self.assertIn("b.cln", paths)
            self.assertNotIn("a.cln", paths)


class TestQueryAndSemantics(unittest.TestCase):
    def test_query_and_semantics(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.cln").write_text(SAMPLE_A)
            (root / "b.cln").write_text(SAMPLE_B)
            index_directory(root)

            # Both have callout, but only b.cln has "API" in title
            results = query_index(root, directive="callout", title="API")
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0]["path"], "b.cln")


class TestQueryNoResults(unittest.TestCase):
    def test_query_no_results(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.cln").write_text(SAMPLE_A)
            index_directory(root)

            results = query_index(root, directive="nonexistent")
            self.assertEqual(results, [])


class TestQueryMissingDb(unittest.TestCase):
    def test_query_missing_db(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.assertRaises(FileNotFoundError):
                query_index(root)


class TestStatsDocumentCount(unittest.TestCase):
    def test_stats_document_count(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.cln").write_text(SAMPLE_A)
            (root / "b.cln").write_text(SAMPLE_B)
            index_directory(root)

            stats = corpus_stats(root)
            self.assertEqual(stats["total_documents"], 2)


class TestStatsDirectiveHistogram(unittest.TestCase):
    def test_stats_directive_histogram(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.cln").write_text(SAMPLE_A)
            (root / "b.cln").write_text(SAMPLE_B)
            (root / "c.cln").write_text(SAMPLE_C)
            index_directory(root)

            stats = corpus_stats(root)
            hist = stats["directive_histogram"]
            self.assertEqual(hist["callout"], 2)
            self.assertEqual(hist["figure"], 1)


class TestStatsBrokenReferences(unittest.TestCase):
    def test_stats_broken_references(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.cln").write_text(SAMPLE_A)
            # c.cln links to other.cln which doesn't exist
            (root / "c.cln").write_text(SAMPLE_C)
            index_directory(root)

            stats = corpus_stats(root)
            broken = stats["broken_references"]
            self.assertTrue(len(broken) >= 1)
            targets = [b["to"] for b in broken]
            self.assertIn("other.cln", targets)


class TestWarnWhenStale(unittest.TestCase):
    def test_warn_when_stale(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = root / "a.cln"
            doc.write_text(SAMPLE_A)
            index_directory(root)

            # Bump mtime so file is newer than DB
            db_mtime = (root / DB_NAME).stat().st_mtime
            os.utime(str(doc), (db_mtime + 2, db_mtime + 2))

            self.assertTrue(check_and_warn_staleness(root))


class TestNoWarnWhenFresh(unittest.TestCase):
    def test_no_warn_when_fresh(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.cln").write_text(SAMPLE_A)
            index_directory(root)

            self.assertFalse(check_and_warn_staleness(root))


class TestQueryAllDocuments(unittest.TestCase):
    def test_query_no_filters_returns_all(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.cln").write_text(SAMPLE_A)
            (root / "b.cln").write_text(SAMPLE_B)
            index_directory(root)

            results = query_index(root)
            self.assertEqual(len(results), 2)


class TestQueryByAttribute(unittest.TestCase):
    def test_query_by_attribute(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "a.cln").write_text(SAMPLE_A)
            (root / "b.cln").write_text(SAMPLE_B)
            index_directory(root)

            # kind=warning only in b.cln
            results = query_index(root, attribute='kind=warning')
            paths = [r["path"] for r in results]
            self.assertIn("b.cln", paths)
            self.assertNotIn("a.cln", paths)


class TestFormatResults(unittest.TestCase):
    def test_format_results(self) -> None:
        results = [
            {
                "path": "a.cln",
                "title": "Getting Started",
                "directives": ["callout"],
                "references": [],
            },
        ]
        output = format_results(results)
        self.assertIn("a.cln", output)
        self.assertIn("Getting Started", output)

    def test_format_results_empty(self) -> None:
        output = format_results([])
        self.assertIn("no", output.lower())


class TestFormatStats(unittest.TestCase):
    def test_format_stats(self) -> None:
        stats = {
            "total_documents": 3,
            "directive_histogram": {"callout": 2, "figure": 1},
            "broken_references": [
                {"from": "c.cln", "to": "other.cln", "anchor": "setup"},
            ],
        }
        output = format_stats(stats)
        self.assertIn("3", output)
        self.assertIn("callout", output)
        self.assertIn("other.cln", output)

    def test_format_stats_no_broken(self) -> None:
        stats = {
            "total_documents": 1,
            "directive_histogram": {"callout": 1},
            "broken_references": [],
        }
        output = format_stats(stats)
        self.assertIn("1", output)
        # Should not mention broken references as an issue
        self.assertNotIn("other.cln", output)


if __name__ == "__main__":
    unittest.main()
