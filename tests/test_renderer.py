"""Tests for the HTML renderer."""

import unittest


class UrlSchemeSecurityTests(unittest.TestCase):
    """Verify dangerous URI schemes are blocked in rendered output."""

    def _render_doc(self, blocks, notes=None):
        from clearnotation_reference.models import NormalizedDocument
        from clearnotation_reference.renderer import render_html
        doc = NormalizedDocument(meta={}, blocks=blocks, notes=notes or [])
        return render_html(doc)

    def test_javascript_link_is_sanitized(self):
        from clearnotation_reference.models import NParagraph, Link, Text
        doc_html = self._render_doc([
            NParagraph(content=[
                Link(label=[Text("click")], target="javascript:alert(1)")
            ])
        ])
        self.assertNotIn('href="javascript:', doc_html)
        self.assertIn('href="#"', doc_html)

    def test_data_link_is_sanitized(self):
        from clearnotation_reference.models import NParagraph, Link, Text
        doc_html = self._render_doc([
            NParagraph(content=[
                Link(label=[Text("click")], target="data:text/html,<script>alert(1)</script>")
            ])
        ])
        self.assertNotIn('href="data:', doc_html)

    def test_https_link_is_allowed(self):
        from clearnotation_reference.models import NParagraph, Link, Text
        doc_html = self._render_doc([
            NParagraph(content=[
                Link(label=[Text("click")], target="https://example.com")
            ])
        ])
        self.assertIn('href="https://example.com"', doc_html)

    def test_relative_link_is_allowed(self):
        from clearnotation_reference.models import NParagraph, Link, Text
        doc_html = self._render_doc([
            NParagraph(content=[
                Link(label=[Text("docs")], target="/docs/intro")
            ])
        ])
        self.assertIn('href="/docs/intro"', doc_html)

    def test_anchor_link_is_allowed(self):
        from clearnotation_reference.models import NParagraph, Link, Text
        doc_html = self._render_doc([
            NParagraph(content=[
                Link(label=[Text("section")], target="#overview")
            ])
        ])
        self.assertIn('href="#overview"', doc_html)

    def test_javascript_figure_src_is_sanitized(self):
        from clearnotation_reference.models import NFigure
        doc_html = self._render_doc([
            NFigure(src="javascript:alert(1)", blocks=[])
        ])
        self.assertNotIn('src="javascript:', doc_html)

    def test_data_figure_src_is_sanitized(self):
        from clearnotation_reference.models import NFigure
        doc_html = self._render_doc([
            NFigure(src="data:image/svg+xml,<script>alert(1)</script>", blocks=[])
        ])
        self.assertNotIn('src="data:', doc_html)


if __name__ == "__main__":
    unittest.main()
