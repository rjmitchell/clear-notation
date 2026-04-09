"""Block/document parser for the reference ClearNotation implementation."""

from __future__ import annotations

from pathlib import Path

from .errors import ParseFailure

from .inline_parser import InlineParser
from .literals import LiteralParser
from .models import (
    BlockDirective,
    BlockNode,
    BlockQuote,
    Comment,
    Document,
    Heading,
    ListItem,
    OrderedItem,
    OrderedList,
    Paragraph,
    SourceBlock,
    Text,
    ThematicBreak,
    UnorderedList,
)
from .patterns import HEADING_RE, IDENTIFIER_RE, ORDERED_RE
from .registry import DirectiveSpec, Registry


class ReferenceParser:
    def __init__(self, registry: Registry) -> None:
        self.registry = registry

    def parse_document(self, source: str, path: Path) -> Document:
        lines = source.splitlines()
        index = 0
        meta: dict[str, object] = {}
        while index < len(lines) and self._is_blank(lines[index]):
            index += 1
        if index < len(lines) and lines[index].lstrip(" \t").startswith("::meta{"):
            meta, index = self._parse_meta_block(lines, index)
        blocks, index = self._parse_blocks(lines, index, stop_on_closer=False)
        if index != len(lines):
            raise ParseFailure("unexpected_document_state", "Parser did not consume the full document", line=index + 1)
        return Document(path=path, meta=meta, blocks=blocks)

    def _parse_meta_block(self, lines: list[str], index: int) -> tuple[dict[str, object], int]:
        line = lines[index].lstrip(" \t")
        if line != "::meta{":
            raise ParseFailure("invalid_meta_block", "Invalid meta opener", line=index + 1)
        index += 1
        meta: dict[str, object] = {}
        while index < len(lines):
            trimmed = lines[index].lstrip(" \t")
            if trimmed == "}":
                return meta, index + 1
            if self._is_blank(lines[index]):
                index += 1
                continue
            parser = LiteralParser(lines[index].lstrip(" \t"))
            key = parser.parse_identifier(dotted=True)
            parser.skip_ws()
            parser.expect("=")
            value = parser.parse_value()
            if not parser.eof():
                raise ParseFailure("invalid_meta_block", "Unexpected trailing content in meta entry", line=index + 1)
            meta[key] = value
            index += 1
        raise ParseFailure("invalid_meta_block", "Unterminated meta block", line=index + 1)

    def _parse_blocks(
        self,
        lines: list[str],
        index: int,
        *,
        stop_on_closer: bool,
    ) -> tuple[list[BlockNode], int]:
        blocks: list[BlockNode] = []
        while index < len(lines):
            if self._is_blank(lines[index]):
                index += 1
                continue
            trimmed = lines[index].lstrip(" \t")
            if trimmed == "}":
                if stop_on_closer:
                    return blocks, index + 1
                raise ParseFailure("unexpected_directive_closer", "Unexpected standalone directive closer", line=index + 1)
            if trimmed.startswith("::meta{"):
                raise ParseFailure("meta_not_first", "::meta may only appear as the first nonblank block", line=index + 1)
            block, index = self._parse_block(lines, index)
            blocks.append(block)
        if stop_on_closer:
            raise ParseFailure("unclosed_block_directive", "Unterminated directive body", line=index + 1)
        return blocks, index

    def _parse_block(self, lines: list[str], index: int) -> tuple[BlockNode, int]:
        line = lines[index]
        trimmed = line.lstrip(" \t")
        if trimmed.startswith("//"):
            return Comment(text=trimmed[2:], source_line=index + 1), index + 1
        if trimmed == "---":
            return ThematicBreak(source_line=index + 1), index + 1
        if match := HEADING_RE.match(line):
            marker = match.group("marker")
            if match.group("space") != " " or not match.group("rest"):
                raise ParseFailure("missing_required_marker_space", "Heading marker must be followed by one space", line=index + 1)
            return Heading(level=len(marker), children=self._parse_inline_line(match.group("rest"), line=index + 1), source_line=index + 1), index + 1
        if trimmed.startswith("```"):
            return self._parse_fenced_code(lines, index)
        if trimmed.startswith(">"):
            return self._parse_blockquote(lines, index)
        if trimmed.startswith("-"):
            line_indent = len(line) - len(line.lstrip(" "))
            return self._parse_unordered_list(lines, index, indent=line_indent)
        if ORDERED_RE.match(trimmed):
            line_indent = len(line) - len(line.lstrip(" "))
            return self._parse_ordered_list(lines, index, indent=line_indent)
        directive_name = self._directive_name(trimmed)
        if directive_name is not None:
            if directive_name == "meta":
                raise ParseFailure("meta_not_first", "::meta may only appear first", line=index + 1)
            spec = self.registry.block(directive_name)
            if spec is None:
                if self.registry.inline(directive_name) is None:
                    raise ParseFailure("unknown_block_directive", f"Unknown block directive {directive_name}", line=index + 1)
            else:
                return self._parse_block_directive(lines, index, spec)
        return self._parse_paragraph(lines, index)

    def _parse_fenced_code(self, lines: list[str], index: int) -> tuple[SourceBlock, int]:
        start_line = index + 1
        opener = lines[index].lstrip(" \t")
        language = opener[3:].strip()
        if not language:
            raise ParseFailure("missing_code_fence_language", "Code fences require a language tag", line=index + 1)
        body: list[str] = []
        index += 1
        while index < len(lines):
            trimmed = lines[index].lstrip(" \t")
            if trimmed == "```":
                return SourceBlock(language=language, text="\n".join(body), source_line=start_line), index + 1
            body.append(lines[index])
            index += 1
        raise ParseFailure("unclosed_block_directive", "Unterminated fenced code block", line=start_line)

    def _parse_blockquote(self, lines: list[str], index: int) -> tuple[BlockQuote, int]:
        start_line = index + 1
        items: list[list] = []
        while index < len(lines):
            line = lines[index]
            trimmed = line.lstrip(" \t")
            if not trimmed.startswith(">"):
                break
            if not trimmed.startswith("> "):
                raise ParseFailure("missing_required_marker_space", "Blockquote marker must be followed by one space", line=index + 1)
            items.append(self._parse_inline_line(trimmed[2:], line=index + 1))
            index += 1
        return BlockQuote(lines=items, source_line=start_line), index

    def _parse_unordered_list(self, lines: list[str], index: int, *, indent: int = 0) -> tuple[UnorderedList, int]:
        start_line = index + 1
        items: list[ListItem] = []
        while index < len(lines):
            line = lines[index]
            if self._is_blank(line):
                break
            line_indent = len(line) - len(line.lstrip(" "))
            if "\t" in line[:line_indent]:
                raise ParseFailure("invalid_list_indent", "Tabs not allowed in list indentation", line=index + 1)
            if line_indent < indent:
                break
            if line_indent > indent:
                break  # handled by parent as nested content
            trimmed = line[indent:]
            if not trimmed.startswith("- "):
                break
            children = self._parse_inline_line(trimmed[2:], line=index + 1)
            item_line = index + 1
            index += 1
            blocks, index = self._parse_list_item_body(lines, index, item_indent=indent + 2)
            items.append(ListItem(children=children, blocks=blocks, source_line=item_line))
        if not items:
            raise ParseFailure("invalid_block", "Invalid unordered list", line=start_line)
        return UnorderedList(items=items, source_line=start_line), index

    def _parse_ordered_list(self, lines: list[str], index: int, *, indent: int = 0) -> tuple[OrderedList, int]:
        start_line = index + 1
        items: list[OrderedItem] = []
        while index < len(lines):
            line = lines[index]
            if self._is_blank(line):
                break
            line_indent = len(line) - len(line.lstrip(" "))
            if "\t" in line[:line_indent]:
                raise ParseFailure("invalid_list_indent", "Tabs not allowed in list indentation", line=index + 1)
            if line_indent < indent:
                break
            if line_indent > indent:
                break
            match = ORDERED_RE.match(line[indent:])
            if match is None:
                break
            if match.group("space") != " " or not match.group("rest"):
                raise ParseFailure("missing_required_marker_space", "Ordered list marker must be followed by one space", line=index + 1)
            # Content column: indent + marker length (e.g. "1. " = 3)
            marker_len = len(match.group("number")) + 2  # digits + ". "
            children = self._parse_inline_line(match.group("rest"), line=index + 1)
            item_line = index + 1
            index += 1
            blocks, index = self._parse_list_item_body(lines, index, item_indent=indent + marker_len)
            items.append(OrderedItem(ordinal=int(match.group("number")), children=children, blocks=blocks, source_line=item_line))
        return OrderedList(items=items, source_line=start_line), index

    def _parse_list_item_body(self, lines: list[str], index: int, *, item_indent: int) -> tuple[list[BlockNode], int]:
        """Parse continuation blocks for a list item at the given indent level.

        Handles nested lists (detected by ``- `` or ordered marker at deeper indent)
        and multi-paragraph continuation (blank line followed by indented text).
        """
        blocks: list[BlockNode] = []
        while index < len(lines):
            # Blank lines: check if followed by indented continuation
            if self._is_blank(lines[index]):
                next_idx = index + 1
                while next_idx < len(lines) and self._is_blank(lines[next_idx]):
                    next_idx += 1
                if next_idx >= len(lines):
                    break
                next_line = lines[next_idx]
                next_leading = next_line[:len(next_line) - len(next_line.lstrip())]
                if "\t" in next_leading:
                    raise ParseFailure("invalid_list_indent", "Tabs not allowed in list indentation", line=next_idx + 1)
                next_indent = len(next_line) - len(next_line.lstrip(" "))
                if next_indent < item_indent:
                    break  # dedent after blank = end of item
                index = next_idx
                # Fall through to parse the indented content below

            line = lines[index]
            # Count leading spaces (tabs are forbidden in list indentation)
            leading_ws = line[:len(line) - len(line.lstrip())]
            if "\t" in leading_ws:
                raise ParseFailure("invalid_list_indent", "Tabs not allowed in list indentation", line=index + 1)
            line_indent = len(line) - len(line.lstrip(" "))
            if line_indent < item_indent:
                break  # dedent = end of item body

            dedented = line[item_indent:]
            # Nested unordered list
            if dedented.startswith("- "):
                nested_list, index = self._parse_unordered_list(lines, index, indent=item_indent)
                blocks.append(nested_list)
                continue
            # Nested ordered list
            if ORDERED_RE.match(dedented):
                nested_list, index = self._parse_ordered_list(lines, index, indent=item_indent)
                blocks.append(nested_list)
                continue
            # Continuation paragraph: collect lines at this indent
            para_lines: list[list] = []
            while index < len(lines):
                ln = lines[index]
                if self._is_blank(ln):
                    break
                ln_indent = len(ln) - len(ln.lstrip(" "))
                if ln_indent < item_indent:
                    break
                ln_dedented = ln[item_indent:]
                # Stop if this line starts a nested list
                if ln_dedented.startswith("- ") or ORDERED_RE.match(ln_dedented):
                    break
                para_lines.append(self._parse_inline_line(ln_dedented.strip(), line=index + 1))
                index += 1
            if para_lines:
                children: list = []
                for pl in para_lines:
                    if children:
                        children.append(Text(" "))
                    children.extend(pl)
                blocks.append(Paragraph(children=children, source_line=index))

        return blocks, index

    def _parse_block_directive(self, lines: list[str], index: int, spec: DirectiveSpec) -> tuple[BlockDirective, int]:
        start_line = index + 1
        line = lines[index].lstrip(" \t")
        pos = 2 + len(spec.name)
        attrs: dict[str, object] = {}
        literal = LiteralParser(line[pos:])
        literal.skip_ws()
        if literal.pos < len(literal.text) and literal.text[literal.pos] == "[":
            attrs, consumed = literal.parse_attribute_list()
            pos += consumed
            literal = LiteralParser(line[pos:])
        literal.skip_ws()
        remainder = literal.text[literal.pos:]
        if spec.body_mode == "none":
            if remainder.strip():
                raise ParseFailure("invalid_block_directive", "Unexpected body syntax for self-closing directive", line=start_line)
            return BlockDirective(name=spec.name, attrs=attrs, body_mode=spec.body_mode, source_line=start_line), index + 1
        if remainder.strip() != "{":
            raise ParseFailure("invalid_block_directive", "Directive body must open with '{' on the same line", line=start_line)
        if spec.body_mode == "parsed":
            blocks, next_index = self._parse_blocks(lines, index + 1, stop_on_closer=True)
            return BlockDirective(name=spec.name, attrs=attrs, body_mode=spec.body_mode, blocks=blocks, source_line=start_line), next_index
        raw_lines: list[str] = []
        next_index = index + 1
        while next_index < len(lines):
            if lines[next_index].lstrip(" \t") == "}":
                return (
                    BlockDirective(
                        name=spec.name,
                        attrs=attrs,
                        body_mode=spec.body_mode,
                        raw_text="\n".join(raw_lines),
                        source_line=start_line,
                    ),
                    next_index + 1,
                )
            raw_lines.append(lines[next_index])
            next_index += 1
        raise ParseFailure("unclosed_block_directive", "Unterminated raw directive body", line=start_line)

    def _parse_paragraph(self, lines: list[str], index: int) -> tuple[Paragraph, int]:
        start_line = index + 1
        parsed_lines: list[list] = []
        while index < len(lines):
            line = lines[index]
            if self._is_blank(line):
                break
            trimmed = line.lstrip(" \t")
            if trimmed == "}":
                break
            if parsed_lines and self._starts_non_paragraph_block(trimmed):
                break
            if not parsed_lines and trimmed.startswith("::meta{"):
                raise ParseFailure("meta_not_first", "::meta may only appear first", line=index + 1)
            parsed_lines.append(self._parse_inline_line(line.strip(), line=index + 1))
            index += 1
        children: list = []
        for line_nodes in parsed_lines:
            if children:
                children.append(Text(" "))
            children.extend(line_nodes)
        return Paragraph(children=children, source_line=start_line), index

    def _parse_inline_line(self, text: str, *, line: int | None = None) -> list:
        text = self._strip_inline_comment(text)
        parser = InlineParser(text, self.registry, line=line)
        return parser.parse()

    def _starts_non_paragraph_block(self, trimmed: str) -> bool:
        if not trimmed:
            return False
        if trimmed.startswith("//"):
            return True
        if trimmed == "---":
            return True
        if trimmed.startswith("```") or trimmed.startswith("> ") or trimmed.startswith("::meta{"):
            return True
        if HEADING_RE.match(trimmed):
            return True
        if trimmed.startswith("- "):
            return True
        if ORDERED_RE.match(trimmed):
            return True
        name = self._directive_name(trimmed)
        if name is not None:
            if name == "meta":
                return True
            if self.registry.block(name) is not None:
                return True
            if self.registry.inline(name) is None:
                return True
        return False

    def _directive_name(self, trimmed: str) -> str | None:
        if not trimmed.startswith("::"):
            return None
        match = IDENTIFIER_RE.match(trimmed, 2)
        if match is None:
            return None
        return match.group(0)

    @staticmethod
    def _strip_inline_comment(text: str) -> str:
        """Strip a trailing ``// comment`` from *text*.

        An inline comment starts with ``//`` preceded by at least one space or
        tab, and must NOT be inside a code span (backticks).  Escaped backticks
        (``\\```) do not toggle the code-span state.

        Returns *text* up to (but not including) the whitespace before the ``//``,
        with trailing whitespace stripped.  If no inline comment is found the
        original string is returned unchanged.
        """
        in_code = False
        i = 0
        length = len(text)
        while i < length:
            ch = text[i]
            if ch == '\\' and in_code and i + 1 < length and text[i + 1] in ('\\', '`'):
                # Skip escaped backslash or backtick inside code span
                i += 2
                continue
            if ch == '\\' and not in_code and i + 1 < length:
                # Skip any escape in non-code context
                i += 2
                continue
            if ch == '`':
                in_code = not in_code
                i += 1
                continue
            if not in_code and ch == '/' and i + 1 < length and text[i + 1] == '/':
                # Check that the // is preceded by at least one space or tab
                if i > 0 and text[i - 1] in (' ', '\t'):
                    return text[:i - 1].rstrip()
            i += 1
        return text

    @staticmethod
    def _is_blank(line: str) -> bool:
        return not line.strip()
