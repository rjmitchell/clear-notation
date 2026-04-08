"""Tests for math rendering via latex2mathml in the renderer."""

from __future__ import annotations

import unittest

from clearnotation_reference.renderer import _render_math, render_html
from clearnotation_reference.models import NMathBlock, NormalizedDocument


class RenderMathTests(unittest.TestCase):
    """Unit tests for the _render_math helper."""

    def test_basic_latex_produces_mathml(self) -> None:
        result = _render_math(r"\int_0^1 x^2 dx")
        self.assertIn("<math", result)
        self.assertIn('display="block"', result)
        self.assertNotIn("<pre", result)

    def test_empty_string_falls_back(self) -> None:
        result = _render_math("")
        self.assertIn("<pre", result)
        self.assertIn("math", result)

    def test_whitespace_only_falls_back(self) -> None:
        result = _render_math("   ")
        self.assertIn("<pre", result)

    def test_simple_expression(self) -> None:
        result = _render_math("x^2 + y^2 = z^2")
        self.assertIn("<math", result)
        self.assertIn("<msup>", result)


class RenderMathBlockTests(unittest.TestCase):
    """Integration test: NMathBlock renders inside a <div class="math">."""

    def test_math_block_wraps_in_div(self) -> None:
        block = NMathBlock(text=r"\sum_{i=1}^n i", id=None)
        doc = NormalizedDocument(meta={}, blocks=[block], notes=[])
        html = render_html(doc)
        self.assertIn('<div class="math">', html)
        self.assertIn("<math", html)
        self.assertNotIn('<pre class="math"', html)

    def test_math_block_with_id(self) -> None:
        block = NMathBlock(text="a + b", id="eq-1")
        doc = NormalizedDocument(meta={}, blocks=[block], notes=[])
        html = render_html(doc)
        self.assertIn('<div class="math" id="eq-1">', html)

    def test_empty_math_block_renders_fallback(self) -> None:
        block = NMathBlock(text="", id=None)
        doc = NormalizedDocument(meta={}, blocks=[block], notes=[])
        html = render_html(doc)
        self.assertIn('<div class="math">', html)
        # Empty body → fallback <pre>
        self.assertIn("<pre", html)


if __name__ == "__main__":
    unittest.main()
