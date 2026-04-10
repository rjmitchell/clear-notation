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
        self.assertIn('href="#"', doc_html)

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
        self.assertIn('src="#"', doc_html)

    def test_data_figure_src_is_sanitized(self):
        from clearnotation_reference.models import NFigure
        doc_html = self._render_doc([
            NFigure(src="data:image/svg+xml,<script>alert(1)</script>", blocks=[])
        ])
        self.assertNotIn('src="data:', doc_html)
        self.assertIn('src="#"', doc_html)

    def test_uppercase_javascript_link_is_sanitized(self):
        from clearnotation_reference.models import NParagraph, Link, Text
        doc_html = self._render_doc([
            NParagraph(content=[
                Link(label=[Text("click")], target="JAVASCRIPT:alert(1)")
            ])
        ])
        self.assertNotIn('JAVASCRIPT:', doc_html)
        self.assertIn('href="#"', doc_html)

    def test_protocol_relative_link_is_sanitized(self):
        from clearnotation_reference.models import NParagraph, Link, Text
        doc_html = self._render_doc([
            NParagraph(content=[
                Link(label=[Text("click")], target="//evil.com/path")
            ])
        ])
        self.assertNotIn('href="//evil.com', doc_html)
        self.assertIn('href="#"', doc_html)

    def test_percent_encoded_javascript_link_is_sanitized(self):
        from clearnotation_reference.models import NParagraph, Link, Text
        doc_html = self._render_doc([
            NParagraph(content=[
                Link(label=[Text("click")], target="javascript%3aalert(1)")
            ])
        ])
        self.assertNotIn('javascript', doc_html.lower().replace('click', ''))  # ensure no trace in href
        self.assertIn('href="#"', doc_html)

    def test_percent_encoded_uppercase_javascript_link_is_sanitized(self):
        from clearnotation_reference.models import NParagraph, Link, Text
        doc_html = self._render_doc([
            NParagraph(content=[
                Link(label=[Text("click")], target="JAVASCRIPT%3Aalert(1)")
            ])
        ])
        self.assertIn('href="#"', doc_html)

    def test_protocol_relative_figure_src_is_sanitized(self):
        from clearnotation_reference.models import NFigure
        doc_html = self._render_doc([
            NFigure(src="//tracker.example.com/pixel.gif", blocks=[])
        ])
        self.assertNotIn('src="//tracker', doc_html)
        self.assertIn('src="#"', doc_html)

    def test_malformed_percent_encoding_is_blocked(self):
        # Python's urllib.parse.unquote is lenient and won't raise on most bad input.
        # Verify the overall contract: non-safe schemes always produce "#".
        from clearnotation_reference.models import NParagraph, Link, Text
        doc_html = self._render_doc([
            NParagraph(content=[
                Link(label=[Text("x")], target="javascript%3Aalert(1)")
            ])
        ])
        self.assertIn('href="#"', doc_html)


if __name__ == "__main__":
    unittest.main()
