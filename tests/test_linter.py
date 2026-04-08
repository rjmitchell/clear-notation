"""Tests for the schema linter."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from clearnotation_reference.linter import LintIssue, format_issues, lint_corpus

# ---------------------------------------------------------------------------
# Sample documents
# ---------------------------------------------------------------------------

SAMPLE_GOOD = """\
# Hello

::callout[kind="info", title="Note"]{
A callout block.
}
"""

SAMPLE_MISSING_DIRECTIVE = """\
# No Callout Here

Just a paragraph.
"""

SAMPLE_MISSING_ATTRIBUTE = """\
# Missing Attr

::callout[title="Note"]{
No kind attribute here.
}
"""

SAMPLE_BROKEN = """\
# Broken

::callout[kind="info"{
This is never closed properly and has a parse error.
"""

# ---------------------------------------------------------------------------
# Sample schemas
# ---------------------------------------------------------------------------

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

SCHEMA_SPECIFIC_ATTR = """\
[schema.default]
required_directives = ["callout"]

[schema.default.required_attributes]
"callout" = ["title"]
"""

SCHEMA_INVALID_TOML = """\
[schema.default
required_directives = ["callout"]
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _write(root: Path, name: str, content: str) -> Path:
    p = root / name
    p.write_text(content, encoding="utf-8")
    return p


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestCleanCorpus(unittest.TestCase):
    """Good doc with all required directives → 0 issues."""

    def test_clean_corpus(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            schema_path = _write(root, "schema.toml", SCHEMA_TOML)
            _write(root, "good.cln", SAMPLE_GOOD)

            issues = lint_corpus(root, schema_path)
            self.assertEqual(issues, [])


class TestMissingDirective(unittest.TestCase):
    """Doc missing a required directive → 1 issue mentioning the directive name."""

    def test_missing_directive(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            schema_path = _write(root, "schema.toml", SCHEMA_TOML)
            _write(root, "doc.cln", SAMPLE_MISSING_DIRECTIVE)

            issues = lint_corpus(root, schema_path)
            self.assertEqual(len(issues), 1)
            self.assertIn("callout", issues[0].message)
            self.assertEqual(issues[0].path, "doc.cln")
            self.assertEqual(issues[0].severity, "warning")


class TestMissingAttribute(unittest.TestCase):
    """Directive missing a specific required attribute → 1 issue."""

    def test_missing_attribute(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            schema_path = _write(root, "schema.toml", SCHEMA_SPECIFIC_ATTR)
            # callout has kind but not title
            doc = """\
# Doc

::callout[kind="info"]{
No title.
}
"""
            _write(root, "doc.cln", doc)

            issues = lint_corpus(root, schema_path)
            self.assertEqual(len(issues), 1)
            self.assertIn("title", issues[0].message)
            self.assertIn("callout", issues[0].message)


class TestMixedPassFail(unittest.TestCase):
    """Multiple docs: some pass, some fail."""

    def test_mixed_pass_fail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            schema_path = _write(root, "schema.toml", SCHEMA_TOML)
            _write(root, "good.cln", SAMPLE_GOOD)
            _write(root, "bad.cln", SAMPLE_MISSING_DIRECTIVE)

            issues = lint_corpus(root, schema_path)
            paths = [i.path for i in issues]
            self.assertIn("bad.cln", paths)
            self.assertNotIn("good.cln", paths)


class TestMalformedSchema(unittest.TestCase):
    """Invalid TOML schema → ValueError."""

    def test_malformed_schema(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            schema_path = _write(root, "bad_schema.toml", SCHEMA_INVALID_TOML)
            _write(root, "doc.cln", SAMPLE_GOOD)

            with self.assertRaises(ValueError):
                lint_corpus(root, schema_path)


class TestSkipBrokenCln(unittest.TestCase):
    """Broken .cln file → skipped with an error-severity issue."""

    def test_skip_broken_cln(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            schema_path = _write(root, "schema.toml", SCHEMA_TOML)
            _write(root, "broken.cln", SAMPLE_BROKEN)

            issues = lint_corpus(root, schema_path)
            self.assertEqual(len(issues), 1)
            self.assertEqual(issues[0].severity, "error")
            self.assertEqual(issues[0].path, "broken.cln")


class TestWildcardAttribute(unittest.TestCase):
    """'*' pattern applies to ALL directives."""

    def test_wildcard_attribute_fails_when_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            schema_path = _write(root, "schema.toml", SCHEMA_WITH_ATTRS)
            # callout is present but lacks 'kind' attribute
            doc = """\
# Doc

::callout[title="Note"]{
Missing kind.
}
"""
            _write(root, "doc.cln", doc)

            issues = lint_corpus(root, schema_path)
            attr_issues = [i for i in issues if "kind" in i.message]
            self.assertTrue(len(attr_issues) >= 1)

    def test_wildcard_attribute_passes_when_present(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            schema_path = _write(root, "schema.toml", SCHEMA_WITH_ATTRS)
            _write(root, "good.cln", SAMPLE_GOOD)  # has kind="info"

            issues = lint_corpus(root, schema_path)
            self.assertEqual(issues, [])


class TestFormatIssues(unittest.TestCase):
    """format_issues produces readable terminal output."""

    def test_format_no_issues(self) -> None:
        output = format_issues([])
        self.assertIn("No issues", output)

    def test_format_warning(self) -> None:
        issues = [LintIssue(path="doc.cln", message="missing 'callout'", severity="warning")]
        output = format_issues(issues)
        self.assertIn("WARNING", output)
        self.assertIn("doc.cln", output)
        self.assertIn("missing 'callout'", output)

    def test_format_error(self) -> None:
        issues = [LintIssue(path="broken.cln", message="parse failed", severity="error")]
        output = format_issues(issues)
        self.assertIn("ERROR", output)
        self.assertIn("broken.cln", output)

    def test_format_multiple_issues(self) -> None:
        issues = [
            LintIssue(path="a.cln", message="missing 'callout'"),
            LintIssue(path="b.cln", message="missing 'example'"),
        ]
        output = format_issues(issues)
        self.assertIn("a.cln", output)
        self.assertIn("b.cln", output)


class TestEmptyCorpus(unittest.TestCase):
    """Empty directory → no issues."""

    def test_empty_corpus(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            schema_path = _write(root, "schema.toml", SCHEMA_TOML)

            issues = lint_corpus(root, schema_path)
            self.assertEqual(issues, [])


class TestNestedDirectives(unittest.TestCase):
    """Directives nested inside other directives are checked too."""

    def test_nested_directive_attribute_checked(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            # require 'kind' on all directives
            schema_path = _write(root, "schema.toml", SCHEMA_WITH_ATTRS)
            # outer callout has kind, but inner callout does not
            doc = """\
# Nested

::callout[kind="info", title="Outer"]{
::callout[title="Inner"]{
Missing kind on nested.
}
}
"""
            _write(root, "doc.cln", doc)

            issues = lint_corpus(root, schema_path)
            kind_issues = [i for i in issues if "kind" in i.message]
            self.assertTrue(len(kind_issues) >= 1)


if __name__ == "__main__":
    unittest.main()
