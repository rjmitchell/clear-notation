"""Opinionated source formatter for ClearNotation documents.

Operates on the **parsed tree** (pre-validation, pre-normalization) to avoid
serialising validator mutations (auto-generated IDs, normalised attrs, note
numbering).  Roundtrip correctness: ``parse(format(src)) == parse(src)`` at
the parsed-tree level.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .models import (
    BlockDirective,
    BlockNode,
    BlockQuote,
    CodeSpan,
    Comment,
    Document,
    Emphasis,
    Heading,
    InlineDirective,
    InlineNode,
    Link,
    ListItem,
    Note,
    OrderedItem,
    OrderedList,
    Paragraph,
    SourceBlock,
    Strong,
    Text,
    ThematicBreak,
    UnorderedList,
)
from .parser import ReferenceParser
from .registry import Registry
from .utils import split_table_row


class Formatter:
    def __init__(self, registry: Registry) -> None:
        self.registry = registry

    def format(self, source: str) -> str:
        parser = ReferenceParser(self.registry)
        doc = parser.parse_document(source, Path("<fmt>"))
        lines = self._format_document(doc)
        result = "\n".join(lines)
        if result and not result.endswith("\n"):
            result += "\n"
        return result

    def _format_document(self, doc: Document) -> list[str]:
        lines: list[str] = []
        if doc.meta:
            lines.append("::meta{")
            for key, value in doc.meta.items():
                lines.append(f"  {key} = {self._format_literal(value)}")
            lines.append("}")
            lines.append("")
        for i, block in enumerate(doc.blocks):
            if i > 0 or doc.meta:
                lines.append("")
            lines.extend(self._format_block(block))
        return lines

    def _format_block(self, block: BlockNode) -> list[str]:
        if isinstance(block, Heading):
            marker = "#" * block.level
            return [f"{marker} {self._format_inlines(block.children)}"]

        if isinstance(block, Paragraph):
            return [self._format_inlines(block.children)]

        if isinstance(block, Comment):
            return [f"//{block.text}"]

        if isinstance(block, ThematicBreak):
            return ["---"]

        if isinstance(block, BlockQuote):
            return [f"> {self._format_inlines(line)}" for line in block.lines]

        if isinstance(block, UnorderedList):
            return self._format_unordered_list(block)

        if isinstance(block, OrderedList):
            return self._format_ordered_list(block)

        if isinstance(block, SourceBlock):
            lines = [f"```{block.language}"]
            lines.extend(block.text.splitlines())
            lines.append("```")
            return lines

        if isinstance(block, BlockDirective):
            return self._format_directive(block)

        return []

    def _format_unordered_list(self, block: UnorderedList, *, prefix: str = "") -> list[str]:
        lines: list[str] = []
        for item in block.items:
            lines.append(f"{prefix}- {self._format_inlines(item.children)}")
            lines.extend(self._format_list_item_body(item.blocks, indent=prefix + "  "))
        return lines

    def _format_ordered_list(self, block: OrderedList, *, prefix: str = "") -> list[str]:
        lines: list[str] = []
        for item in block.items:
            marker = f"{item.ordinal}. "
            lines.append(f"{prefix}{marker}{self._format_inlines(item.children)}")
            lines.extend(self._format_list_item_body(item.blocks, indent=prefix + " " * len(marker)))
        return lines

    def _format_list_item_body(self, blocks: list[BlockNode], *, indent: str) -> list[str]:
        lines: list[str] = []
        for i, block in enumerate(blocks):
            if isinstance(block, UnorderedList):
                lines.extend(self._format_unordered_list(block, prefix=indent))
            elif isinstance(block, OrderedList):
                lines.extend(self._format_ordered_list(block, prefix=indent))
            elif isinstance(block, Paragraph):
                lines.append("")
                lines.append(f"{indent}{self._format_inlines(block.children)}")
            else:
                for sub_line in self._format_block(block):
                    lines.append(f"{indent}{sub_line}" if sub_line else "")
        return lines

    def _format_directive(self, block: BlockDirective) -> list[str]:
        header = f"::{block.name}"
        if block.attrs:
            header += self._format_attrs(block.attrs)
        if block.body_mode == "none":
            return [header]
        lines = [f"{header} {{"]
        if block.body_mode == "parsed":
            for i, child in enumerate(block.blocks):
                if i > 0:
                    lines.append("")
                for line in self._format_block(child):
                    lines.append(f"  {line}" if line else "")
        elif block.body_mode == "raw" and block.raw_text:
            for raw_line in block.raw_text.splitlines():
                lines.append(raw_line)
        lines.append("}")
        return lines

    def _format_attrs(self, attrs: dict[str, Any]) -> str:
        parts: list[str] = []
        for key, value in attrs.items():
            parts.append(f'{key}={self._format_literal(value)}')
        return "[" + ", ".join(parts) + "]"

    def _format_literal(self, value: Any) -> str:
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, int):
            return str(value)
        if isinstance(value, str):
            return f'"{value}"'
        if isinstance(value, list):
            inner = ", ".join(self._format_literal(v) for v in value)
            return f"[{inner}]"
        return repr(value)

    def _format_inlines(self, nodes: list[InlineNode]) -> str:
        parts: list[str] = []
        for node in nodes:
            if isinstance(node, Text):
                parts.append(self._escape_text(node.value))
            elif isinstance(node, CodeSpan):
                parts.append(f"`{self._escape_code(node.value)}`")
            elif isinstance(node, Strong):
                parts.append(f"+{{{self._format_inlines(node.children)}}}")
            elif isinstance(node, Emphasis):
                parts.append(f"*{{{self._format_inlines(node.children)}}}")
            elif isinstance(node, Note):
                parts.append(f"^{{{self._format_inlines(node.children)}}}")
            elif isinstance(node, Link):
                label = self._format_inlines(node.label)
                parts.append(f"[{label} -> {node.target}]")
            elif isinstance(node, InlineDirective):
                part = f"::{node.name}"
                if node.attrs:
                    part += self._format_attrs(node.attrs)
                parts.append(part)
        return "".join(parts)

    def _escape_text(self, text: str) -> str:
        out: list[str] = []
        i = 0
        while i < len(text):
            ch = text[i]
            # Escape characters that would start inline constructs
            if ch == "\\" or ch == "`":
                out.append("\\")
                out.append(ch)
            elif ch == "[":
                out.append("\\[")
            elif ch == "+":
                if i + 1 < len(text) and text[i + 1] == "{":
                    out.append("\\+")
                else:
                    out.append(ch)
            elif ch == "*":
                if i + 1 < len(text) and text[i + 1] == "{":
                    out.append("\\*")
                else:
                    out.append(ch)
            elif ch == "^":
                if i + 1 < len(text) and text[i + 1] == "{":
                    out.append("\\^")
                else:
                    out.append(ch)
            elif ch == ":":
                if i + 1 < len(text) and text[i + 1] == ":":
                    out.append("\\:")
                else:
                    out.append(ch)
            else:
                out.append(ch)
            i += 1
        return "".join(out)

    def _escape_code(self, text: str) -> str:
        return text.replace("\\", "\\\\").replace("`", "\\`")
