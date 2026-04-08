"""Markdown-to-ClearNotation converter.

Uses mistune v3 to parse Markdown into an AST, then walks the tree
to emit ClearNotation (.cln) syntax.  Demo-quality: handles the 80%
case well, logs skipped content to stderr.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import mistune


# ---------------------------------------------------------------------------
# Public data types
# ---------------------------------------------------------------------------

@dataclass
class SkippedContent:
    line: int
    reason: str
    content: str


@dataclass
class ConversionReport:
    total_lines: int
    skipped_lines: int
    skipped: list[SkippedContent] = field(default_factory=list)

    @property
    def loss_percent(self) -> float:
        if self.total_lines == 0:
            return 0.0
        return (self.skipped_lines / self.total_lines) * 100.0


# ---------------------------------------------------------------------------
# YAML front-matter stripper
# ---------------------------------------------------------------------------

_FRONT_MATTER_RE = re.compile(r"\A---[ \t]*\n(.*?\n)---[ \t]*\n", re.DOTALL)


def _strip_front_matter(source: str) -> tuple[str, str | None]:
    """Return (body, front_matter_text_or_None)."""
    m = _FRONT_MATTER_RE.match(source)
    if m:
        return source[m.end():], m.group(0)
    return source, None


# ---------------------------------------------------------------------------
# Inline rendering helpers
# ---------------------------------------------------------------------------

def _render_inline(children: list[dict[str, Any]], skipped: list[SkippedContent]) -> str:
    """Flatten a list of mistune inline tokens to CLN inline text."""
    parts: list[str] = []
    for tok in children:
        t = tok["type"]
        if t == "text":
            parts.append(_escape_inline_text(tok["raw"]))
        elif t == "strong":
            inner = _render_inline(tok.get("children", []), skipped)
            parts.append(f"+{{{inner}}}")
        elif t == "emphasis":
            inner = _render_inline(tok.get("children", []), skipped)
            parts.append(f"*{{{inner}}}")
        elif t == "codespan":
            code = tok["raw"]
            # Escape backslashes and backticks for CLN code spans
            code = code.replace("\\", "\\\\").replace("`", "\\`")
            parts.append(f"`{code}`")
        elif t == "link":
            label = _render_inline(tok.get("children", []), skipped)
            url = tok.get("attrs", {}).get("url", "")
            parts.append(f"[{label} -> {url}]")
        elif t == "image":
            # Images are block-level in CLN — handled by the caller.
            # If we encounter one inline, collect it; caller will emit figure.
            pass
        elif t == "inline_html":
            skipped.append(SkippedContent(
                line=0,
                reason="inline HTML not supported in CLN",
                content=tok["raw"],
            ))
        elif t == "softbreak":
            parts.append(" ")
        elif t == "linebreak":
            parts.append(" ")
        else:
            # Best-effort: dump raw if present
            if "raw" in tok:
                parts.append(tok["raw"])
    return "".join(parts)


def _escape_inline_text(text: str) -> str:
    """Escape characters that have meaning in CLN inline contexts.

    CLN inline special chars: +{ *{ ^{ :: [ ] ` \\
    We only escape the sequences that would trigger inline parsing.
    """
    result: list[str] = []
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "\\" :
            result.append("\\\\")
            i += 1
        elif ch == "`":
            result.append("\\`")
            i += 1
        elif ch == "[":
            result.append("\\[")
            i += 1
        elif ch == "]":
            result.append("\\]")
            i += 1
        elif ch in ("+", "*", "^") and i + 1 < len(text) and text[i + 1] == "{":
            result.append(f"\\{ch}{{")
            i += 2
        elif ch == ":" and i + 1 < len(text) and text[i + 1] == ":":
            result.append("\\::")
            i += 2
        else:
            result.append(ch)
            i += 1
    return "".join(result)


def _collect_images(children: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Extract image tokens from inline children."""
    return [tok for tok in children if tok["type"] == "image"]


# ---------------------------------------------------------------------------
# Block rendering
# ---------------------------------------------------------------------------

def _render_tokens(
    tokens: list[dict[str, Any]],
    skipped: list[SkippedContent],
    *,
    source_lines: list[str],
) -> list[str]:
    """Convert a list of top-level mistune tokens to CLN output lines."""
    out: list[str] = []

    for tok in tokens:
        t = tok["type"]

        if t == "blank_line":
            continue

        elif t == "paragraph":
            children = tok.get("children", [])
            images = _collect_images(children)
            non_image = [c for c in children if c["type"] != "image"]

            # Render text portion of the paragraph
            if non_image:
                text = _render_inline(non_image, skipped)
                # Clean up whitespace that may result from removing images
                text = re.sub(r"  +", " ", text).strip()
                if text:
                    out.append(text)
                    out.append("")

            # Emit any images as ::figure blocks after the paragraph
            for img in images:
                alt = _render_inline(img.get("children", []), skipped)
                url = img.get("attrs", {}).get("url", "")
                out.append(f'::figure[src="{url}"]{{')
                if alt:
                    out.append(alt)
                out.append("}")
                out.append("")

        elif t == "heading":
            level = tok.get("attrs", {}).get("level", 1)
            children = tok.get("children", [])
            text = _render_inline(children, skipped)
            out.append(f"{'#' * level} {text}")
            out.append("")

        elif t == "block_code":
            info = tok.get("attrs", {}).get("info", "") if tok.get("attrs") else ""
            lang = info.strip() if info else "text"
            raw = tok.get("raw", "")
            # Remove trailing newline that mistune adds
            if raw.endswith("\n"):
                raw = raw[:-1]
            out.append(f"```{lang}")
            out.append(raw)
            out.append("```")
            out.append("")

        elif t == "thematic_break":
            out.append("---")
            out.append("")

        elif t == "block_quote":
            bq_children = tok.get("children", [])
            # CLN blockquotes are flat (inline only) — skip nested blocks
            bq_blocks = []
            bq_inline = []
            for child in bq_children:
                if child["type"] in ("code", "block_code", "fenced_code"):
                    raw = child.get("raw", child.get("text", ""))
                    skipped.append(SkippedContent(
                        line=0,
                        reason="code block inside blockquote not supported in CLN",
                        content=raw.strip()[:80],
                    ))
                else:
                    bq_inline.append(child)
            inner_lines = _render_tokens(bq_inline, skipped, source_lines=source_lines)
            for line in inner_lines:
                if line == "":
                    # Don't emit "> " for blank separator lines between
                    # block-quote paragraphs — just skip them so we don't
                    # produce a bare ">" that the CLN parser rejects.
                    continue
                out.append(f"> {line}")
            out.append("")

        elif t == "list":
            _render_list(tok, skipped, out, source_lines=source_lines)
            out.append("")

        elif t == "table":
            _render_table(tok, skipped, out)
            out.append("")

        elif t == "block_html":
            raw = tok.get("raw", "").strip()
            skipped.append(SkippedContent(
                line=0,
                reason="block HTML not supported in CLN",
                content=raw,
            ))

        else:
            # Unknown block type — skip
            raw = tok.get("raw", "")
            if raw:
                skipped.append(SkippedContent(
                    line=0,
                    reason=f"unsupported block type: {t}",
                    content=raw.strip(),
                ))

    return out


def _render_list(
    tok: dict[str, Any],
    skipped: list[SkippedContent],
    out: list[str],
    *,
    source_lines: list[str],
) -> None:
    """Render a list (ordered or unordered), flattening nested lists."""
    ordered = tok.get("attrs", {}).get("ordered", False)
    items = tok.get("children", [])
    ordinal = 1

    for item in items:
        # Each list_item has children which may be block_text + nested list
        item_children = item.get("children", [])
        text_parts: list[str] = []
        nested_lists: list[dict[str, Any]] = []

        for child in item_children:
            if child["type"] == "list":
                nested_lists.append(child)
            elif child["type"] in ("paragraph", "block_text"):
                text_parts.append(
                    _render_inline(child.get("children", []), skipped)
                )

        text = " ".join(text_parts).strip()
        if ordered:
            out.append(f"{ordinal}. {text}")
            ordinal += 1
        else:
            out.append(f"- {text}")

        # Flatten nested lists at the same level
        for nested in nested_lists:
            _render_list(nested, skipped, out, source_lines=source_lines)


def _render_table(
    tok: dict[str, Any],
    skipped: list[SkippedContent],
    out: list[str],
) -> None:
    """Render a mistune table token to CLN ::table directive."""
    children = tok.get("children", [])
    rows: list[list[str]] = []
    has_header = False

    for section in children:
        section_type = section["type"]
        if section_type == "table_head":
            has_header = True
            row = []
            for cell in section.get("children", []):
                row.append(_render_inline(cell.get("children", []), skipped))
            rows.append(row)
        elif section_type == "table_body":
            for table_row in section.get("children", []):
                row = []
                for cell in table_row.get("children", []):
                    row.append(_render_inline(cell.get("children", []), skipped))
                rows.append(row)

    header_attr = "true" if has_header else "false"
    out.append(f"::table[header={header_attr}]{{")
    for row in rows:
        out.append(" | ".join(cell.replace("|", "\\|") for cell in row))
    out.append("}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def convert_markdown(
    source: str,
    *,
    return_report: bool = False,
) -> str | tuple[str, ConversionReport]:
    """Convert Markdown text to ClearNotation text.

    If *return_report* is True, returns ``(cln_text, report)`` instead of
    just ``cln_text``.
    """
    total_lines = len(source.splitlines()) if source.strip() else 0

    # Strip YAML front matter
    body, front_matter = _strip_front_matter(source)
    skipped: list[SkippedContent] = []
    if front_matter is not None:
        fm_lines = front_matter.count("\n")
        skipped.append(SkippedContent(
            line=1,
            reason="YAML front matter not supported in CLN",
            content=front_matter.strip(),
        ))

    # Parse Markdown AST
    md = mistune.create_markdown(renderer=None, plugins=["table"])
    tokens: list[dict[str, Any]] = md(body)  # type: ignore[assignment]

    source_lines = body.splitlines()

    # Render to CLN
    out_lines = _render_tokens(tokens, skipped, source_lines=source_lines)

    # Strip trailing blank lines
    while out_lines and out_lines[-1] == "":
        out_lines.pop()

    cln_text = "\n".join(out_lines) + "\n" if out_lines else ""

    report = ConversionReport(
        total_lines=total_lines,
        skipped_lines=sum(s.content.count("\n") + 1 for s in skipped),
        skipped=skipped,
    )

    if return_report:
        return cln_text, report
    return cln_text


def convert_file(
    input_path: Path,
    output_path: Path,
    *,
    report_path: Path | None = None,
) -> ConversionReport:
    """Convert a single .md file to .cln."""
    source = input_path.read_text(encoding="utf-8")
    cln_text, report = convert_markdown(source, return_report=True)  # type: ignore[misc]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(cln_text, encoding="utf-8")

    if report_path is not None:
        lines = [
            f"Total lines: {report.total_lines}",
            f"Skipped lines: {report.skipped_lines}",
            f"Loss: {report.loss_percent:.1f}%",
            "",
        ]
        for s in report.skipped:
            lines.append(f"  line {s.line}: {s.reason}")
            lines.append(f"    {s.content[:120]}")
            lines.append("")
        report_path.write_text("\n".join(lines), encoding="utf-8")

    return report
