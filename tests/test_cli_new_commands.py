"""CLI-level tests for the convert, index, query, and lint subcommands."""

from __future__ import annotations

import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from clearnotation_reference.cli import main


SAMPLE_CLN = "# Hello\n\nA paragraph.\n"
SAMPLE_CLN_WITH_CALLOUT = (
    '# Hello\n\n::callout[kind="info", title="Note"]{\nA note.\n}\n'
)
SAMPLE_MD = "# Hello\n\nA **bold** paragraph.\n"
SCHEMA = '[schema.default]\nrequired_directives = ["callout"]\n'


def _quiet(argv: list[str]) -> int:
    """Run main(argv) with stdout and stderr suppressed; return exit code."""
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(
        io.StringIO()
    ):
        return main(argv)


class TestConvertSubcommand(unittest.TestCase):
    def test_convert_single_file_exit_0(self) -> None:
        """cln convert on a single .md file exits 0 and creates a .cln file."""
        with tempfile.TemporaryDirectory() as tmp:
            md_file = Path(tmp) / "doc.md"
            md_file.write_text(SAMPLE_MD, encoding="utf-8")
            ret = _quiet(["convert", str(md_file)])
            self.assertEqual(ret, 0)
            cln_file = Path(tmp) / "doc.cln"
            self.assertTrue(cln_file.exists(), "Expected .cln output file to exist")

    def test_convert_single_file_output_exists(self) -> None:
        """The .cln output file produced by convert is non-empty."""
        with tempfile.TemporaryDirectory() as tmp:
            md_file = Path(tmp) / "doc.md"
            md_file.write_text(SAMPLE_MD, encoding="utf-8")
            _quiet(["convert", str(md_file)])
            cln_file = Path(tmp) / "doc.cln"
            self.assertGreater(cln_file.stat().st_size, 0)

    def test_convert_directory_exit_0(self) -> None:
        """cln convert on a directory with .md files exits 0."""
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "a.md").write_text(SAMPLE_MD, encoding="utf-8")
            (Path(tmp) / "b.md").write_text("## Section\n\nText.\n", encoding="utf-8")
            ret = _quiet(["convert", tmp])
            self.assertEqual(ret, 0)

    def test_convert_empty_directory_exit_1(self) -> None:
        """cln convert on an empty directory (no .md files) exits 1."""
        with tempfile.TemporaryDirectory() as tmp:
            ret = _quiet(["convert", tmp])
            self.assertEqual(ret, 1)


class TestIndexSubcommand(unittest.TestCase):
    def test_index_directory_with_cln_files_exit_0(self) -> None:
        """cln index on a directory with .cln files exits 0."""
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "doc.cln").write_text(SAMPLE_CLN, encoding="utf-8")
            ret = _quiet(["index", tmp])
            self.assertEqual(ret, 0)

    def test_index_creates_db(self) -> None:
        """cln index creates a .cln-index.db file in the target directory."""
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "doc.cln").write_text(SAMPLE_CLN, encoding="utf-8")
            _quiet(["index", tmp])
            # The indexer should write a DB file
            db_files = list(Path(tmp).glob("*.db"))
            self.assertTrue(len(db_files) > 0, "Expected an index DB file to be created")


class TestQuerySubcommand(unittest.TestCase):
    def _build_indexed_dir(self, tmp: str, cln_text: str = SAMPLE_CLN) -> str:
        """Write a .cln file and index it; return the tmp path."""
        (Path(tmp) / "doc.cln").write_text(cln_text, encoding="utf-8")
        _quiet(["index", tmp])
        return tmp

    def test_query_stats_after_index_exit_0(self) -> None:
        """cln query --stats exits 0 after indexing."""
        with tempfile.TemporaryDirectory() as tmp:
            self._build_indexed_dir(tmp)
            ret = _quiet(["query", "--stats", tmp])
            self.assertEqual(ret, 0)

    def test_query_directive_after_index_exit_0(self) -> None:
        """cln query --directive exits 0 after indexing."""
        with tempfile.TemporaryDirectory() as tmp:
            self._build_indexed_dir(tmp, SAMPLE_CLN_WITH_CALLOUT)
            ret = _quiet(["query", "--directive", "callout", tmp])
            self.assertEqual(ret, 0)

    def test_query_no_index_exit_1(self) -> None:
        """cln query without a prior index exits 1."""
        with tempfile.TemporaryDirectory() as tmp:
            ret = _quiet(["query", "--stats", tmp])
            self.assertEqual(ret, 1)


class TestLintSubcommand(unittest.TestCase):
    def test_lint_clean_corpus_exit_0(self) -> None:
        """cln lint --schema with a corpus that satisfies the schema exits 0."""
        with tempfile.TemporaryDirectory() as tmp:
            # Schema requires 'callout'; document has one
            (Path(tmp) / "doc.cln").write_text(
                SAMPLE_CLN_WITH_CALLOUT, encoding="utf-8"
            )
            schema_file = Path(tmp) / "schema.toml"
            schema_file.write_text(SCHEMA, encoding="utf-8")
            ret = _quiet(["lint", tmp, "--schema", str(schema_file)])
            self.assertEqual(ret, 0)

    def test_lint_missing_directive_exit_1(self) -> None:
        """cln lint --schema exits 1 when a required directive is absent."""
        with tempfile.TemporaryDirectory() as tmp:
            # Schema requires 'callout'; document does NOT have one
            (Path(tmp) / "doc.cln").write_text(SAMPLE_CLN, encoding="utf-8")
            schema_file = Path(tmp) / "schema.toml"
            schema_file.write_text(SCHEMA, encoding="utf-8")
            ret = _quiet(["lint", tmp, "--schema", str(schema_file)])
            self.assertEqual(ret, 1)


if __name__ == "__main__":
    unittest.main()
