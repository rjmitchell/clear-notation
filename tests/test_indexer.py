"""Tests for the SQLite indexer."""

from __future__ import annotations

import json
import os
import sqlite3
import stat
import tempfile
import time
import unittest
from pathlib import Path

from clearnotation_reference.indexer import (
    DB_NAME,
    IndexStats,
    check_staleness,
    index_directory,
)

SAMPLE_CLN = """\
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

See ::ref[target="api-overview"] for setup instructions.

::anchor[id="api-overview"]

## Overview

The API supports [docs -> other.cln#setup].
"""

BROKEN_CLN = """\
# Broken

::callout[kind="info"]{
This callout is never closed.
"""


class TestIndexCreatesDb(unittest.TestCase):
    def test_index_creates_db(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doc.cln").write_text(SAMPLE_CLN)
            index_directory(root)
            self.assertTrue((root / DB_NAME).exists())


class TestDocumentsTable(unittest.TestCase):
    def test_documents_table(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doc.cln").write_text(SAMPLE_CLN)
            index_directory(root)

            conn = sqlite3.connect(str(root / DB_NAME))
            rows = conn.execute("SELECT path, title FROM documents").fetchall()
            conn.close()

            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0][0], "doc.cln")
            self.assertEqual(rows[0][1], "Getting Started")


class TestDirectivesTable(unittest.TestCase):
    def test_directives_table(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doc.cln").write_text(SAMPLE_CLN)
            index_directory(root)

            conn = sqlite3.connect(str(root / DB_NAME))
            rows = conn.execute(
                "SELECT directive_name, attributes FROM directives"
            ).fetchall()
            conn.close()

            names = [r[0] for r in rows]
            self.assertIn("callout", names)

            # Verify attributes are stored as JSON
            callout_row = next(r for r in rows if r[0] == "callout")
            attrs = json.loads(callout_row[1])
            self.assertEqual(attrs["kind"], "info")


class TestReferencesTable(unittest.TestCase):
    def test_references_table(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doc.cln").write_text(SAMPLE_CLN_WITH_REF)
            index_directory(root)

            conn = sqlite3.connect(str(root / DB_NAME))
            rows = conn.execute(
                'SELECT ref_target, ref_type FROM "references"'
            ).fetchall()
            conn.close()

            targets = [r[0] for r in rows]
            self.assertIn("api-overview", targets)


class TestCrossReferencesTable(unittest.TestCase):
    def test_cross_references_table(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doc.cln").write_text(SAMPLE_CLN_WITH_REF)
            index_directory(root)

            conn = sqlite3.connect(str(root / DB_NAME))
            rows = conn.execute(
                "SELECT target_document, anchor FROM cross_references"
            ).fetchall()
            conn.close()

            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0][0], "other.cln")
            self.assertEqual(rows[0][1], "setup")


class TestSkipBrokenFiles(unittest.TestCase):
    def test_skip_broken_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "good.cln").write_text(SAMPLE_CLN)
            (root / "bad.cln").write_text(BROKEN_CLN)

            stats = index_directory(root)

            self.assertEqual(stats.indexed, 1)
            self.assertEqual(stats.skipped, 1)
            self.assertTrue(len(stats.errors) > 0)
            self.assertIn("bad.cln", stats.errors[0])

            # Good file is still indexed
            conn = sqlite3.connect(str(root / DB_NAME))
            rows = conn.execute("SELECT path FROM documents").fetchall()
            conn.close()
            paths = [r[0] for r in rows]
            self.assertIn("good.cln", paths)
            self.assertNotIn("bad.cln", paths)


class TestEmptyDirectory(unittest.TestCase):
    def test_empty_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            stats = index_directory(root)

            self.assertEqual(stats.indexed, 0)
            self.assertEqual(stats.skipped, 0)
            self.assertEqual(stats.unchanged, 0)
            self.assertEqual(stats.errors, [])
            self.assertTrue((root / DB_NAME).exists())


class TestIncrementalReindex(unittest.TestCase):
    def test_incremental_reindex(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doc.cln").write_text(SAMPLE_CLN)

            stats1 = index_directory(root)
            self.assertEqual(stats1.indexed, 1)
            self.assertEqual(stats1.unchanged, 0)

            stats2 = index_directory(root)
            self.assertEqual(stats2.indexed, 0)
            self.assertEqual(stats2.unchanged, 1)


class TestReindexAfterModification(unittest.TestCase):
    def test_reindex_after_modification(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = root / "doc.cln"
            doc.write_text(SAMPLE_CLN)

            stats1 = index_directory(root)
            self.assertEqual(stats1.indexed, 1)

            # Ensure mtime changes by bumping it forward
            mtime = doc.stat().st_mtime
            os.utime(str(doc), (mtime + 2, mtime + 2))

            stats2 = index_directory(root)
            self.assertEqual(stats2.indexed, 1)
            self.assertEqual(stats2.unchanged, 0)


class TestSqliteErrorHandling(unittest.TestCase):
    def test_sqlite_error_handling(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doc.cln").write_text(SAMPLE_CLN)

            # Create a directory where the DB would go to prevent sqlite from creating it
            bad_db = Path(tmp) / "readonly" / DB_NAME
            bad_db.parent.mkdir()
            # Make the directory read-only
            os.chmod(str(bad_db.parent), stat.S_IRUSR | stat.S_IXUSR)

            try:
                with self.assertRaises(OSError):
                    index_directory(root, db_path=bad_db)
            finally:
                # Restore permissions for cleanup
                os.chmod(str(bad_db.parent), stat.S_IRWXU)


class TestCheckStaleness(unittest.TestCase):
    def test_no_db_is_stale(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doc.cln").write_text(SAMPLE_CLN)
            self.assertTrue(check_staleness(root))

    def test_fresh_index_not_stale(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doc.cln").write_text(SAMPLE_CLN)
            index_directory(root)
            self.assertFalse(check_staleness(root))

    def test_modified_file_is_stale(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = root / "doc.cln"
            doc.write_text(SAMPLE_CLN)
            index_directory(root)

            # Bump mtime into the future
            db_mtime = (root / DB_NAME).stat().st_mtime
            os.utime(str(doc), (db_mtime + 2, db_mtime + 2))
            self.assertTrue(check_staleness(root))


if __name__ == "__main__":
    unittest.main()
