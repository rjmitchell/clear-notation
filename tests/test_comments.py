"""Tests for // comment syntax."""

from __future__ import annotations

import unittest
from pathlib import Path

from clearnotation_reference.errors import ParseFailure
from clearnotation_reference.models import Comment, Heading, Paragraph, Text
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


class TestInlineCommentParsing(unittest.TestCase):
    """Tests for // inline comments at the end of lines."""

    def test_heading_with_inline_comment(self) -> None:
        """// comment after heading content — comment stripped, heading text preserved."""
        doc = _parse("# Hello world  // this is a comment\n")
        self.assertIsInstance(doc.blocks[0], Heading)
        text = "".join(
            n.value for n in doc.blocks[0].children if isinstance(n, Text)
        )
        self.assertEqual("Hello world", text)

    def test_paragraph_with_inline_comment(self) -> None:
        """// comment after paragraph text."""
        doc = _parse("Some text here // author note\n")
        self.assertIsInstance(doc.blocks[0], Paragraph)
        text = "".join(
            n.value for n in doc.blocks[0].children if isinstance(n, Text)
        )
        self.assertEqual("Some text here", text)

    def test_list_item_with_inline_comment(self) -> None:
        """// comment after list item."""
        doc = _parse("- First item // todo\n- Second item\n")
        from clearnotation_reference.models import UnorderedList
        self.assertIsInstance(doc.blocks[0], UnorderedList)
        first_item_text = "".join(
            n.value for n in doc.blocks[0].items[0] if isinstance(n, Text)
        )
        self.assertEqual("First item", first_item_text)

    def test_blockquote_with_inline_comment(self) -> None:
        """// comment after blockquote line."""
        from clearnotation_reference.models import BlockQuote
        doc = _parse("> Quoted text // aside\n")
        self.assertIsInstance(doc.blocks[0], BlockQuote)
        text = "".join(
            n.value for n in doc.blocks[0].lines[0] if isinstance(n, Text)
        )
        self.assertEqual("Quoted text", text)

    def test_url_with_double_slash_not_comment(self) -> None:
        """URL containing // (like https://example.com) is NOT treated as inline comment."""
        doc = _parse("Visit [our site -> https://example.com]\n")
        self.assertIsInstance(doc.blocks[0], Paragraph)
        # The link should be intact — not stripped by comment logic
        from clearnotation_reference.models import Link
        links = [n for n in doc.blocks[0].children if isinstance(n, Link)]
        self.assertEqual(1, len(links))
        self.assertEqual("https://example.com", links[0].target)

    def test_double_slash_inside_code_span_not_comment(self) -> None:
        """// inside code span is literal (not treated as comment)."""
        doc = _parse("Use `http://example.com` for testing\n")
        self.assertIsInstance(doc.blocks[0], Paragraph)
        from clearnotation_reference.models import CodeSpan
        code_spans = [n for n in doc.blocks[0].children if isinstance(n, CodeSpan)]
        self.assertEqual(1, len(code_spans))
        self.assertIn("//", code_spans[0].value)

    def test_double_slash_without_preceding_space_not_comment(self) -> None:
        """// without preceding space is NOT a comment."""
        doc = _parse("http://example.com is a URL\n")
        self.assertIsInstance(doc.blocks[0], Paragraph)
        text = "".join(
            n.value for n in doc.blocks[0].children if isinstance(n, Text)
        )
        self.assertIn("//", text)

    def test_inline_comments_stripped_from_normalized_ast(self) -> None:
        """Inline comments stripped from normalized AST — only content remains."""
        from clearnotation_reference.normalizer import Normalizer

        registry = _registry()
        doc = _parse("# Title // heading comment\n\nParagraph text // note\n")
        normalizer = Normalizer(registry)
        normalized = normalizer.normalize(doc)
        heading = normalized.blocks[0]
        # heading content should be "Title" only
        heading_text = "".join(
            n.value for n in heading.content if isinstance(n, Text)
        )
        self.assertEqual("Title", heading_text)
        # paragraph content should be "Paragraph text" only
        para = normalized.blocks[1]
        para_text = "".join(
            n.value for n in para.content if isinstance(n, Text)
        )
        self.assertEqual("Paragraph text", para_text)

    def test_inline_comment_with_tab_separator(self) -> None:
        """// preceded by tab is also a comment."""
        doc = _parse("# Title\t// tab comment\n")
        text = "".join(
            n.value for n in doc.blocks[0].children if isinstance(n, Text)
        )
        self.assertEqual("Title", text)

    def test_ordered_list_with_inline_comment(self) -> None:
        """// comment after ordered list item."""
        from clearnotation_reference.models import OrderedList
        doc = _parse("1. First // note\n2. Second\n")
        self.assertIsInstance(doc.blocks[0], OrderedList)
        first_text = "".join(
            n.value for n in doc.blocks[0].items[0].children if isinstance(n, Text)
        )
        self.assertEqual("First", first_text)

    def test_multiple_double_slashes_uses_first_valid(self) -> None:
        """When multiple // appear, the first one preceded by space is the comment."""
        doc = _parse("Text with // first // second\n")
        text = "".join(
            n.value for n in doc.blocks[0].children if isinstance(n, Text)
        )
        self.assertEqual("Text with", text)

    def test_only_double_slash_in_code_span_is_protected(self) -> None:
        """// after a code span that contains // should still work."""
        doc = _parse("Use `//` prefix // this is a comment\n")
        text_parts = [n.value for n in doc.blocks[0].children if isinstance(n, Text)]
        # Should have "Use " and " prefix" but not the comment
        full_text = "".join(text_parts)
        self.assertNotIn("this is a comment", full_text)
        self.assertIn("prefix", full_text)


if __name__ == "__main__":
    unittest.main()
