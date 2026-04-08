"""Tests for Pygments syntax highlighting in the renderer."""

from __future__ import annotations

import unittest

from clearnotation_reference.renderer import _render_block
from clearnotation_reference.models import NSourceBlock


class SyntaxHighlightTests(unittest.TestCase):
    """Unit tests for source block syntax highlighting."""

    def test_python_code_gets_highlighted(self) -> None:
        block = NSourceBlock(language="python", text='def hello():\n    return "world"')
        result = _render_block(block, [])
        self.assertIn('class="language-python"', result)
        # Pygments should produce spans with hl- prefixed classes
        self.assertIn("hl-", result)
        self.assertIn("<span", result)
        # Should still have our pre>code wrapper
        self.assertIn("<pre>", result)
        self.assertIn("<code", result)

    def test_highlighted_keyword(self) -> None:
        block = NSourceBlock(language="python", text="def foo(): pass")
        result = _render_block(block, [])
        # "def" is a keyword
        self.assertIn('class="hl-k"', result)

    def test_highlighted_string(self) -> None:
        block = NSourceBlock(language="python", text='x = "hello"')
        result = _render_block(block, [])
        # Should have a string token class
        self.assertRegex(result, r'class="hl-s[12]?"')

    def test_unknown_language_falls_back(self) -> None:
        block = NSourceBlock(language="notareallanguage", text="some code")
        result = _render_block(block, [])
        self.assertIn('class="language-notareallanguage"', result)
        # Fallback: escaped text, no spans
        self.assertIn("some code", result)
        self.assertNotIn("<span", result)

    def test_source_block_with_id(self) -> None:
        block = NSourceBlock(language="python", text="x = 1", id="code-1")
        result = _render_block(block, [])
        self.assertIn('id="code-1"', result)
        self.assertIn("hl-", result)

    def test_javascript_highlighting(self) -> None:
        block = NSourceBlock(language="javascript", text='const x = 42;\nconsole.log(x);')
        result = _render_block(block, [])
        self.assertIn("hl-", result)
        self.assertIn("<span", result)

    def test_no_outer_div_wrapper(self) -> None:
        """Pygments should not add its own wrapping div (nowrap=True)."""
        block = NSourceBlock(language="python", text="x = 1")
        result = _render_block(block, [])
        self.assertNotIn("<div", result)
        self.assertTrue(result.startswith("<pre>"))

    def test_html_in_code_not_double_escaped(self) -> None:
        """Pygments handles escaping; we should not double-escape."""
        block = NSourceBlock(language="python", text='x = "<b>bold</b>"')
        result = _render_block(block, [])
        # The angle brackets in the string should be escaped exactly once
        self.assertIn("&lt;b&gt;", result)
        self.assertNotIn("&amp;lt;", result)


if __name__ == "__main__":
    unittest.main()
