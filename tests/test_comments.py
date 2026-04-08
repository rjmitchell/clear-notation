"""Tests for // comment syntax."""

from __future__ import annotations

import unittest
from pathlib import Path

from clearnotation_reference.errors import ParseFailure
from clearnotation_reference.models import Comment, Heading, Paragraph
from clearnotation_reference.parser import ReferenceParser
from clearnotation_reference.formatter import Formatter
from clearnotation_reference.config import load_config
from clearnotation_reference.registry import Registry

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "valid"


def _registry():
    _, reg_data = load_config(FIXTURE_DIR / "v01-minimal.cln")
    return Registry.from_toml(reg_data)


def _parse(source: str):
    parser = ReferenceParser(_registry())
    return parser.parse_document(source, Path("<test>"))


class TestCommentParsing(unittest.TestCase):
    def test_comment_between_blocks(self) -> None:
        doc = _parse("# Heading\n\n// a comment\n\nA paragraph.\n")
        types = [type(b).__name__ for b in doc.blocks]
        self.assertEqual(types, ["Heading", "Comment", "Paragraph"])

    def test_comment_text_preserved(self) -> None:
        doc = _parse("// hello world\n")
        self.assertIsInstance(doc.blocks[0], Comment)
        self.assertEqual(doc.blocks[0].text, " hello world")

    def test_comment_no_space(self) -> None:
        doc = _parse("//no space\n")
        self.assertIsInstance(doc.blocks[0], Comment)
        self.assertEqual(doc.blocks[0].text, "no space")

    def test_empty_comment(self) -> None:
        doc = _parse("//\n")
        self.assertIsInstance(doc.blocks[0], Comment)
        self.assertEqual(doc.blocks[0].text, "")

    def test_comment_at_document_start(self) -> None:
        doc = _parse("// first line\n# Title\n")
        self.assertIsInstance(doc.blocks[0], Comment)
        self.assertIsInstance(doc.blocks[1], Heading)

    def test_comment_at_document_end(self) -> None:
        doc = _parse("# Title\n// trailing\n")
        self.assertEqual(len(doc.blocks), 2)
        self.assertIsInstance(doc.blocks[1], Comment)

    def test_multiple_consecutive_comments(self) -> None:
        doc = _parse("// one\n// two\n// three\n")
        comments = [b for b in doc.blocks if isinstance(b, Comment)]
        self.assertEqual(len(comments), 3)

    def test_comment_breaks_paragraph(self) -> None:
        """A comment line should end a preceding paragraph."""
        doc = _parse("First line.\n// comment\nSecond line.\n")
        types = [type(b).__name__ for b in doc.blocks]
        self.assertEqual(types, ["Paragraph", "Comment", "Paragraph"])


class TestCommentInParsedDirective(unittest.TestCase):
    def test_comment_inside_callout(self) -> None:
        source = '::callout[kind="info"]{\n// inside\nText.\n}\n'
        doc = _parse(source)
        directive = doc.blocks[0]
        types = [type(b).__name__ for b in directive.blocks]
        self.assertEqual(types, ["Comment", "Paragraph"])


class TestCommentNotInRawBodies(unittest.TestCase):
    def test_comment_in_math_is_raw_text(self) -> None:
        source = "::math{\n// not a comment\n}\n"
        doc = _parse(source)
        self.assertIn("// not a comment", doc.blocks[0].raw_text)

    def test_comment_in_table_is_raw_text(self) -> None:
        source = '::table[header=true]{\n// not a comment | col2\n}\n'
        doc = _parse(source)
        self.assertIn("// not a comment", doc.blocks[0].raw_text)

    def test_comment_in_source_is_raw_text(self) -> None:
        source = '::source[language="python"]{\n// not a comment\n}\n'
        doc = _parse(source)
        self.assertIn("// not a comment", doc.blocks[0].raw_text)


class TestCommentNotInFencedCode(unittest.TestCase):
    def test_comment_in_fenced_code_is_literal(self) -> None:
        source = "```python\n// not a comment\n```\n"
        doc = _parse(source)
        self.assertIn("// not a comment", doc.blocks[0].text)


class TestCommentNotInMeta(unittest.TestCase):
    def test_comment_in_meta_is_parse_error(self) -> None:
        source = '::meta{\n// comment\ntitle = "Test"\n}\n'
        with self.assertRaises(ParseFailure):
            _parse(source)


class TestCommentStrippedFromAST(unittest.TestCase):
    def test_normalized_ast_has_no_comments(self) -> None:
        from clearnotation_reference.normalizer import Normalizer

        registry = _registry()
        doc = _parse("// comment\n# Title\n// another\nA paragraph.\n")
        normalizer = Normalizer(registry)
        normalized = normalizer.normalize(doc)
        type_names = [type(b).__name__ for b in normalized.blocks]
        self.assertNotIn("Comment", type_names)
        self.assertEqual(type_names, ["NHeading", "NParagraph"])


class TestFormatterPreservesComments(unittest.TestCase):
    def test_roundtrip(self) -> None:
        source = "// a comment\n\n# Title\n\nA paragraph.\n"
        formatter = Formatter(_registry())
        result = formatter.format(source)
        self.assertIn("// a comment", result)

    def test_comment_inside_directive(self) -> None:
        source = '::callout[kind="info"]{\n// todo\nText.\n}\n'
        formatter = Formatter(_registry())
        result = formatter.format(source)
        self.assertIn("// todo", result)


class TestCommentSourceLine(unittest.TestCase):
    def test_source_line_tracked(self) -> None:
        doc = _parse("# Title\n\n// comment on line 3\n")
        comment = [b for b in doc.blocks if isinstance(b, Comment)][0]
        self.assertEqual(comment.source_line, 3)


if __name__ == "__main__":
    unittest.main()
