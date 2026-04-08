"""Tests for the Markdown-to-CLN converter."""

from __future__ import annotations

import unittest
from pathlib import Path

from clearnotation_reference.converter import (
    ConversionReport,
    SkippedContent,
    convert_file,
    convert_markdown,
)


class TestConvertHeadings(unittest.TestCase):
    def test_h1(self) -> None:
        self.assertEqual(convert_markdown("# Title"), "# Title\n")

    def test_h2(self) -> None:
        self.assertEqual(convert_markdown("## Subtitle"), "## Subtitle\n")

    def test_h3(self) -> None:
        self.assertEqual(convert_markdown("### Deep"), "### Deep\n")

    def test_heading_with_inline(self) -> None:
        result = convert_markdown("# Hello **world**")
        self.assertEqual(result, "# Hello +{world}\n")


class TestConvertParagraph(unittest.TestCase):
    def test_simple_paragraph(self) -> None:
        self.assertEqual(convert_markdown("Just text."), "Just text.\n")

    def test_multi_line_paragraph(self) -> None:
        result = convert_markdown("Line one\nLine two")
        self.assertEqual(result, "Line one Line two\n")


class TestConvertBold(unittest.TestCase):
    def test_bold(self) -> None:
        result = convert_markdown("Some **bold** text")
        self.assertIn("+{bold}", result)

    def test_bold_entire(self) -> None:
        result = convert_markdown("**all bold**")
        self.assertEqual(result, "+{all bold}\n")


class TestConvertItalic(unittest.TestCase):
    def test_italic(self) -> None:
        result = convert_markdown("Some *italic* text")
        self.assertIn("*{italic}", result)

    def test_italic_entire(self) -> None:
        result = convert_markdown("*all italic*")
        self.assertEqual(result, "*{all italic}\n")


class TestConvertCode(unittest.TestCase):
    def test_inline_code(self) -> None:
        result = convert_markdown("Use `code` here")
        self.assertIn("`code`", result)


class TestConvertLink(unittest.TestCase):
    def test_link(self) -> None:
        result = convert_markdown("[Click here](http://example.com)")
        self.assertIn("[Click here -> http://example.com]", result)

    def test_link_with_bold(self) -> None:
        result = convert_markdown("[**bold link**](http://example.com)")
        self.assertIn("[+{bold link} -> http://example.com]", result)


class TestConvertImage(unittest.TestCase):
    def test_standalone_image(self) -> None:
        result = convert_markdown("![alt text](http://img.png)")
        self.assertIn('::figure[src="http://img.png"]{', result)
        self.assertIn("alt text", result)
        self.assertIn("}", result)

    def test_image_in_paragraph(self) -> None:
        result = convert_markdown("Some text ![alt](img.png) more text")
        self.assertIn("Some text more text", result)
        self.assertIn('::figure[src="img.png"]{', result)


class TestConvertFencedCode(unittest.TestCase):
    def test_with_language(self) -> None:
        md = "```python\nprint('hello')\n```"
        result = convert_markdown(md)
        self.assertIn("```python", result)
        self.assertIn("print('hello')", result)
        self.assertIn("```", result)

    def test_without_language_defaults_to_text(self) -> None:
        md = "```\nsome code\n```"
        result = convert_markdown(md)
        self.assertIn("```text", result)
        self.assertIn("some code", result)

    def test_multiline_code(self) -> None:
        md = "```js\nconst x = 1;\nconst y = 2;\n```"
        result = convert_markdown(md)
        self.assertIn("```js", result)
        self.assertIn("const x = 1;", result)
        self.assertIn("const y = 2;", result)


class TestConvertUnorderedList(unittest.TestCase):
    def test_simple_list(self) -> None:
        md = "- item 1\n- item 2\n- item 3"
        result = convert_markdown(md)
        self.assertIn("- item 1", result)
        self.assertIn("- item 2", result)
        self.assertIn("- item 3", result)

    def test_list_with_bold(self) -> None:
        md = "- **bold item**\n- normal item"
        result = convert_markdown(md)
        self.assertIn("- +{bold item}", result)
        self.assertIn("- normal item", result)


class TestConvertOrderedList(unittest.TestCase):
    def test_simple_ordered(self) -> None:
        md = "1. first\n2. second\n3. third"
        result = convert_markdown(md)
        self.assertIn("1. first", result)
        self.assertIn("2. second", result)
        self.assertIn("3. third", result)


class TestConvertBlockquote(unittest.TestCase):
    def test_simple_quote(self) -> None:
        result = convert_markdown("> quoted text")
        self.assertIn("> quoted text", result)

    def test_multiline_quote(self) -> None:
        result = convert_markdown("> line one\n> line two")
        self.assertIn("> line one line two", result)


class TestConvertTable(unittest.TestCase):
    def test_simple_table(self) -> None:
        md = "| A | B |\n|---|---|\n| 1 | 2 |"
        result = convert_markdown(md)
        self.assertIn("::table[header=true]{", result)
        self.assertIn("A | B", result)
        self.assertIn("1 | 2", result)
        self.assertIn("}", result)


class TestConvertThematicBreak(unittest.TestCase):
    def test_hr(self) -> None:
        result = convert_markdown("---\n\nSome text after.")
        # The --- should appear as a thematic break
        self.assertIn("---", result)


class TestConvertEmptyInput(unittest.TestCase):
    def test_empty_string(self) -> None:
        self.assertEqual(convert_markdown(""), "")

    def test_whitespace_only(self) -> None:
        self.assertEqual(convert_markdown("   \n\n   "), "")


class TestConvertInlineHTMLSkipped(unittest.TestCase):
    def test_inline_html_skipped(self) -> None:
        result, report = convert_markdown(
            "text <br> more", return_report=True
        )
        # Output should not contain HTML
        self.assertNotIn("<br>", result)
        # Report should log it
        self.assertTrue(len(report.skipped) > 0)
        self.assertTrue(any("HTML" in s.reason for s in report.skipped))

    def test_block_html_skipped(self) -> None:
        result, report = convert_markdown(
            "<div>block html</div>", return_report=True
        )
        self.assertNotIn("<div>", result)
        self.assertTrue(len(report.skipped) > 0)


class TestConvertFrontMatter(unittest.TestCase):
    def test_yaml_front_matter_stripped(self) -> None:
        md = "---\ntitle: Test\nauthor: Me\n---\n\n# Hello"
        result, report = convert_markdown(md, return_report=True)
        self.assertNotIn("title:", result)
        self.assertNotIn("author:", result)
        self.assertIn("# Hello", result)
        self.assertTrue(len(report.skipped) > 0)
        self.assertTrue(any("front matter" in s.reason for s in report.skipped))


class TestConversionReport(unittest.TestCase):
    def test_loss_percent(self) -> None:
        r = ConversionReport(total_lines=100, skipped_lines=10)
        self.assertAlmostEqual(r.loss_percent, 10.0)

    def test_loss_percent_zero(self) -> None:
        r = ConversionReport(total_lines=0, skipped_lines=0)
        self.assertAlmostEqual(r.loss_percent, 0.0)

    def test_report_from_conversion(self) -> None:
        md = "# Hello\n\nWorld\n\n<div>html</div>"
        _, report = convert_markdown(md, return_report=True)
        self.assertEqual(report.total_lines, 5)
        self.assertTrue(report.skipped_lines > 0)


class TestConvertNested(unittest.TestCase):
    def test_bold_in_italic(self) -> None:
        result = convert_markdown("*italic **bold** end*")
        self.assertIn("*{italic +{bold} end}", result)

    def test_nested_list_flattened(self) -> None:
        md = "- a\n  - b\n    - c"
        result = convert_markdown(md)
        self.assertIn("- a", result)
        self.assertIn("- b", result)
        self.assertIn("- c", result)


class TestOutputParsesCleanly(unittest.TestCase):
    """The critical gate test: converted output must parse + validate
    through the CLN pipeline without raising."""

    def _parse_and_validate(self, cln_text: str) -> None:
        from clearnotation_reference.config import load_config
        from clearnotation_reference.parser import ReferenceParser
        from clearnotation_reference.registry import Registry
        from clearnotation_reference.validator import ReferenceValidator

        dummy_path = Path("/tmp/test.cln")
        _, reg_data = load_config(dummy_path)
        registry = Registry.from_toml(reg_data)

        parser = ReferenceParser(registry)
        doc = parser.parse_document(cln_text, dummy_path)

        validator = ReferenceValidator(registry)
        validator.validate(doc, config={"spec": "0.1"})

    def test_heading_parses(self) -> None:
        cln = convert_markdown("# Hello **world**")
        self._parse_and_validate(cln)

    def test_paragraph_parses(self) -> None:
        cln = convert_markdown("Just a paragraph of text.")
        self._parse_and_validate(cln)

    def test_code_block_parses(self) -> None:
        cln = convert_markdown("```python\nprint(1)\n```")
        self._parse_and_validate(cln)

    def test_code_block_no_lang_parses(self) -> None:
        cln = convert_markdown("```\nsome code\n```")
        self._parse_and_validate(cln)

    def test_list_parses(self) -> None:
        cln = convert_markdown("- item 1\n- item 2")
        self._parse_and_validate(cln)

    def test_ordered_list_parses(self) -> None:
        cln = convert_markdown("1. first\n2. second")
        self._parse_and_validate(cln)

    def test_blockquote_parses(self) -> None:
        cln = convert_markdown("> quoted text")
        self._parse_and_validate(cln)

    def test_thematic_break_parses(self) -> None:
        cln = convert_markdown("---\n\nSome text")
        self._parse_and_validate(cln)

    def test_link_parses(self) -> None:
        cln = convert_markdown("[Click](http://example.com)")
        self._parse_and_validate(cln)

    def test_image_parses(self) -> None:
        cln = convert_markdown("![alt text](http://img.png)")
        self._parse_and_validate(cln)

    def test_table_parses(self) -> None:
        cln = convert_markdown("| A | B |\n|---|---|\n| 1 | 2 |")
        self._parse_and_validate(cln)

    def test_inline_html_output_parses(self) -> None:
        cln = convert_markdown("text <br> more")
        self._parse_and_validate(cln)

    def test_front_matter_output_parses(self) -> None:
        md = "---\ntitle: Test\n---\n\n# Hello"
        cln = convert_markdown(md)
        self._parse_and_validate(cln)

    def test_complex_document_parses(self) -> None:
        md = """# My Document

This is a **bold** and *italic* paragraph with `code`.

## Links and Images

[Click here](http://example.com) for more info.

![screenshot](http://img.png)

## Code

```python
def hello():
    print("world")
```

## Lists

- item one
- item two
- **bold item**

1. first
2. second

> A quote with **bold** text

---

| Name | Value |
|------|-------|
| A    | 1     |
| B    | 2     |

<div>skipped html</div>
"""
        cln = convert_markdown(md)
        self._parse_and_validate(cln)

    def test_no_comment_syntax_in_output(self) -> None:
        """CLN has no comment syntax. Output must never contain
        comment-like markers."""
        md = "text <br> more\n\n<div>html</div>"
        cln = convert_markdown(md)
        self.assertNotIn(":: SKIPPED", cln)
        self.assertNotIn("// ", cln)
        self.assertNotIn("<!-- ", cln)


class TestConvertFile(unittest.TestCase):
    def test_convert_file_roundtrip(self) -> None:
        import tempfile

        md_text = "# Hello\n\nSome **bold** text.\n"
        with tempfile.TemporaryDirectory() as tmpdir:
            inp = Path(tmpdir) / "test.md"
            out = Path(tmpdir) / "test.cln"
            report_file = Path(tmpdir) / "report.txt"

            inp.write_text(md_text, encoding="utf-8")
            report = convert_file(inp, out, report_path=report_file)

            self.assertTrue(out.exists())
            cln_text = out.read_text(encoding="utf-8")
            self.assertIn("# Hello", cln_text)
            self.assertIn("+{bold}", cln_text)
            self.assertTrue(report_file.exists())
            self.assertIsInstance(report, ConversionReport)


if __name__ == "__main__":
    unittest.main()
