"""Tests for nested lists and multi-paragraph list items."""

from __future__ import annotations

import unittest
from pathlib import Path

from clearnotation_reference.config import load_config
from clearnotation_reference.errors import ParseFailure
from clearnotation_reference.models import (
    ListItem,
    OrderedItem,
    OrderedList,
    Paragraph,
    UnorderedList,
)
from clearnotation_reference.normalizer import Normalizer
from clearnotation_reference.parser import ReferenceParser
from clearnotation_reference.registry import Registry
from clearnotation_reference.renderer import render_html
from clearnotation_reference.validator import ReferenceValidator

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "valid"


def _registry():
    _, reg_data = load_config(FIXTURE_DIR / "v01-minimal.cln")
    return Registry.from_toml(reg_data)


def _parse(source: str):
    parser = ReferenceParser(_registry())
    return parser.parse_document(source, Path("<test>"))


def _normalize(source: str):
    registry = _registry()
    doc = _parse(source)
    config, _ = load_config(FIXTURE_DIR / "v01-minimal.cln")
    ReferenceValidator(registry).validate(doc, config=config)
    return Normalizer(registry).normalize(doc)


class TestFlatListBackwardsCompat(unittest.TestCase):
    """Flat lists still parse correctly with the new ListItem model."""

    def test_flat_unordered(self) -> None:
        doc = _parse("- Alpha\n- Beta\n- Gamma\n")
        ul = doc.blocks[0]
        self.assertIsInstance(ul, UnorderedList)
        self.assertEqual(len(ul.items), 3)
        self.assertIsInstance(ul.items[0], ListItem)
        self.assertEqual(ul.items[0].children[0].value, "Alpha")
        self.assertEqual(ul.items[0].blocks, [])

    def test_flat_ordered(self) -> None:
        doc = _parse("1. First\n2. Second\n")
        ol = doc.blocks[0]
        self.assertIsInstance(ol, OrderedList)
        self.assertEqual(len(ol.items), 2)
        self.assertEqual(ol.items[0].ordinal, 1)
        self.assertEqual(ol.items[0].children[0].value, "First")
        self.assertEqual(ol.items[0].blocks, [])


class TestNestedUnorderedLists(unittest.TestCase):
    def test_two_level_nesting(self) -> None:
        source = "- Parent\n  - Child\n"
        doc = _parse(source)
        ul = doc.blocks[0]
        self.assertEqual(len(ul.items), 1)
        # Parent item has one nested block: an UnorderedList
        self.assertEqual(len(ul.items[0].blocks), 1)
        nested = ul.items[0].blocks[0]
        self.assertIsInstance(nested, UnorderedList)
        self.assertEqual(nested.items[0].children[0].value, "Child")

    def test_three_level_nesting(self) -> None:
        source = "- A\n  - B\n    - C\n"
        doc = _parse(source)
        a = doc.blocks[0].items[0]
        b = a.blocks[0].items[0]
        c = b.blocks[0].items[0]
        self.assertEqual(a.children[0].value, "A")
        self.assertEqual(b.children[0].value, "B")
        self.assertEqual(c.children[0].value, "C")

    def test_siblings_after_nested(self) -> None:
        source = "- Parent\n  - Child\n- Sibling\n"
        doc = _parse(source)
        ul = doc.blocks[0]
        self.assertEqual(len(ul.items), 2)
        self.assertEqual(ul.items[0].children[0].value, "Parent")
        self.assertEqual(ul.items[1].children[0].value, "Sibling")
        self.assertEqual(len(ul.items[1].blocks), 0)

    def test_multiple_nested_items(self) -> None:
        source = "- Parent\n  - Child 1\n  - Child 2\n"
        doc = _parse(source)
        parent = doc.blocks[0].items[0]
        nested = parent.blocks[0]
        self.assertIsInstance(nested, UnorderedList)
        self.assertEqual(len(nested.items), 2)


class TestNestedOrderedLists(unittest.TestCase):
    def test_nested_ordered_in_unordered(self) -> None:
        source = "- Item\n  1. Sub one\n  2. Sub two\n"
        doc = _parse(source)
        parent = doc.blocks[0].items[0]
        nested = parent.blocks[0]
        self.assertIsInstance(nested, OrderedList)
        self.assertEqual(nested.items[0].ordinal, 1)
        self.assertEqual(nested.items[1].ordinal, 2)

    def test_nested_unordered_in_ordered(self) -> None:
        source = "1. Step\n   - Detail A\n   - Detail B\n"
        doc = _parse(source)
        parent = doc.blocks[0].items[0]
        nested = parent.blocks[0]
        self.assertIsInstance(nested, UnorderedList)
        self.assertEqual(len(nested.items), 2)


class TestMultiParagraphItems(unittest.TestCase):
    def test_continuation_paragraph(self) -> None:
        source = "- First line.\n\n  Continuation paragraph.\n"
        doc = _parse(source)
        item = doc.blocks[0].items[0]
        self.assertEqual(item.children[0].value, "First line.")
        self.assertEqual(len(item.blocks), 1)
        self.assertIsInstance(item.blocks[0], Paragraph)
        self.assertEqual(item.blocks[0].children[0].value, "Continuation paragraph.")

    def test_continuation_plus_nested_list(self) -> None:
        source = "- Main item.\n\n  Extra paragraph.\n\n  - Nested\n"
        doc = _parse(source)
        item = doc.blocks[0].items[0]
        self.assertEqual(len(item.blocks), 2)
        self.assertIsInstance(item.blocks[0], Paragraph)
        self.assertIsInstance(item.blocks[1], UnorderedList)

    def test_ordered_continuation(self) -> None:
        source = "1. Step one.\n\n   More about step one.\n"
        doc = _parse(source)
        item = doc.blocks[0].items[0]
        self.assertEqual(len(item.blocks), 1)
        self.assertIsInstance(item.blocks[0], Paragraph)


class TestListParseErrors(unittest.TestCase):
    def test_tab_in_space_indent_is_error(self) -> None:
        """A tab mixed into space indentation triggers invalid_list_indent."""
        source = "- Parent\n \t- Child\n"
        with self.assertRaises(ParseFailure) as ctx:
            _parse(source)
        self.assertEqual(ctx.exception.kind, "invalid_list_indent")


class TestNestedListRendering(unittest.TestCase):
    def test_nested_unordered_html(self) -> None:
        ndoc = _normalize("- Parent\n  - Child\n")
        html = render_html(ndoc)
        self.assertIn("<ul>", html)
        self.assertIn("<li><p>Parent</p><ul>", html)
        self.assertIn("<li>Child</li>", html)

    def test_flat_list_no_wrapping_p(self) -> None:
        ndoc = _normalize("- Simple\n")
        html = render_html(ndoc)
        self.assertIn("<li>Simple</li>", html)
        self.assertNotIn("<li><p>Simple</p></li>", html)

    def test_multi_paragraph_html(self) -> None:
        ndoc = _normalize("- Main.\n\n  Extra.\n")
        html = render_html(ndoc)
        self.assertIn("<li><p>Main.</p><p>Extra.</p></li>", html)


class TestNestedListNormalization(unittest.TestCase):
    def test_normalized_list_item_has_blocks(self) -> None:
        from clearnotation_reference.models import NListItem
        ndoc = _normalize("- Parent\n  - Child\n")
        ul = ndoc.blocks[0]
        self.assertEqual(len(ul.items), 1)
        self.assertIsInstance(ul.items[0], NListItem)
        self.assertTrue(len(ul.items[0].blocks) > 0)


if __name__ == "__main__":
    unittest.main()
