"""Inline parser for ClearNotation text contexts."""

from __future__ import annotations

from typing import Any

from .errors import ParseFailure

from .literals import LiteralParser
from .models import CodeSpan, Emphasis, InlineDirective, InlineNode, Link, Note, Strong, Text
from .patterns import IDENTIFIER_RE, LINK_TARGET_ESCAPES, TEXT_ESCAPES
from .registry import Registry


class InlineParser:
    def __init__(
        self,
        text: str,
        registry: Registry,
        *,
        allow_strong: bool = True,
        allow_emphasis: bool = True,
        allow_link: bool = True,
        allow_note: bool = True,
        allow_inline_directive: bool = True,
    ) -> None:
        self.text = text
        self.registry = registry
        self.pos = 0
        self.allow_strong = allow_strong
        self.allow_emphasis = allow_emphasis
        self.allow_link = allow_link
        self.allow_note = allow_note
        self.allow_inline_directive = allow_inline_directive

    def parse(self, *, stop_token: str | None = None) -> list[InlineNode]:
        nodes: list[InlineNode] = []
        buffer: list[str] = []
        while self.pos < len(self.text):
            if stop_token is not None and self.text.startswith(stop_token, self.pos):
                break
            if self.text.startswith("+{", self.pos):
                if not self.allow_strong:
                    raise ParseFailure("disallowed_inline_construct", "Strong text is not allowed here")
                self._flush_text(nodes, buffer)
                self.pos += 2
                nodes.append(Strong(self._parse_until_closer(context="styled")))
                continue
            if self.text.startswith("*{", self.pos):
                if not self.allow_emphasis:
                    raise ParseFailure("disallowed_inline_construct", "Emphasis is not allowed here")
                self._flush_text(nodes, buffer)
                self.pos += 2
                nodes.append(Emphasis(self._parse_until_closer(context="styled")))
                continue
            if self.text.startswith("^{", self.pos):
                if not self.allow_note:
                    raise ParseFailure("disallowed_inline_construct", "Notes are not allowed here")
                self._flush_text(nodes, buffer)
                self.pos += 2
                nodes.append(Note(self._parse_until_closer(context="note")))
                continue
            if self.text.startswith("::", self.pos):
                if not self.allow_inline_directive:
                    raise ParseFailure("disallowed_inline_construct", "Inline directives are not allowed here")
                self._flush_text(nodes, buffer)
                nodes.append(self._parse_inline_directive())
                continue
            ch = self.text[self.pos]
            if ch == "[":
                if not self.allow_link:
                    raise ParseFailure("disallowed_inline_construct", "Links are not allowed here")
                self._flush_text(nodes, buffer)
                nodes.append(self._parse_link())
                continue
            if ch == "`":
                self._flush_text(nodes, buffer)
                nodes.append(self._parse_code_span())
                continue
            if ch == "\\":
                self.pos += 1
                if self.pos >= len(self.text):
                    raise ParseFailure("invalid_escape_sequence", "Dangling escape at end of line")
                escaped = self.text[self.pos]
                self.pos += 1
                if escaped not in TEXT_ESCAPES:
                    raise ParseFailure("invalid_escape_sequence", f"Unsupported escape \\{escaped}")
                buffer.append(TEXT_ESCAPES[escaped])
                continue
            if stop_token is not None and ch == "}":
                break
            buffer.append(ch)
            self.pos += 1
        self._flush_text(nodes, buffer)
        return nodes

    def _flush_text(self, nodes: list[InlineNode], buffer: list[str]) -> None:
        if not buffer:
            return
        value = "".join(buffer)
        if nodes and isinstance(nodes[-1], Text):
            nodes[-1].value += value
        else:
            nodes.append(Text(value))
        buffer.clear()

    def _parse_until_closer(self, *, context: str) -> list[InlineNode]:
        child = InlineParser(
            self.text[self.pos:],
            self.registry,
            allow_strong=context == "note",
            allow_emphasis=context == "note",
            allow_link=context == "note",
            allow_note=False,
            allow_inline_directive=context == "note",
        )
        nodes = child.parse(stop_token="}")
        if child.pos >= len(child.text) or child.text[child.pos] != "}":
            raise ParseFailure("unclosed_inline_construct", "Expected closing '}'")
        self.pos += child.pos + 1
        return nodes

    def _parse_code_span(self) -> CodeSpan:
        self.pos += 1
        chars: list[str] = []
        while self.pos < len(self.text):
            ch = self.text[self.pos]
            self.pos += 1
            if ch == "`":
                return CodeSpan("".join(chars))
            if ch == "\\":
                if self.pos >= len(self.text):
                    raise ParseFailure("invalid_escape_sequence", "Dangling escape in code span")
                escaped = self.text[self.pos]
                self.pos += 1
                if escaped not in {"\\", "`"}:
                    raise ParseFailure("invalid_escape_sequence", f"Unsupported code escape \\{escaped}")
                chars.append(escaped)
                continue
            chars.append(ch)
        raise ParseFailure("unclosed_inline_construct", "Unterminated code span")

    def _parse_inline_directive(self) -> InlineDirective:
        match = IDENTIFIER_RE.match(self.text, self.pos + 2)
        if match is None:
            raise ParseFailure("unknown_inline_directive", "Expected inline directive name")
        name = match.group(0)
        spec = self.registry.inline(name)
        if spec is None:
            raise ParseFailure("unknown_inline_directive", f"Unknown inline directive {name}")
        pos = match.end()
        attrs: dict[str, Any] = {}
        parser = LiteralParser(self.text[pos:])
        parser.skip_ws()
        if parser.pos < len(parser.text) and parser.text[parser.pos] == "[":
            attrs, consumed = parser.parse_attribute_list()
            pos += consumed
        self.pos = pos
        return InlineDirective(name=name, attrs=attrs)

    def _parse_link(self) -> Link:
        self.pos += 1
        label_parser = InlineParser(
            self.text[self.pos:],
            self.registry,
            allow_strong=True,
            allow_emphasis=True,
            allow_link=False,
            allow_note=False,
            allow_inline_directive=False,
        )
        label = label_parser.parse(stop_token=" -> ")
        if not label_parser.text.startswith(" -> ", label_parser.pos):
            raise ParseFailure("invalid_link_target", "Link is missing a valid target separator")
        self.pos += label_parser.pos + 4
        target_chars: list[str] = []
        while self.pos < len(self.text):
            ch = self.text[self.pos]
            self.pos += 1
            if ch == "]":
                target = "".join(target_chars)
                if not target:
                    raise ParseFailure("invalid_link_target", "Link target must not be empty")
                return Link(label=label, target=target)
            if ch in {" ", "\t"}:
                raise ParseFailure("invalid_link_target", "Link target may not contain spaces or tabs")
            if ch == "\\":
                if self.pos >= len(self.text):
                    raise ParseFailure("invalid_escape_sequence", "Dangling escape in link target")
                escaped = self.text[self.pos]
                self.pos += 1
                if escaped not in LINK_TARGET_ESCAPES:
                    raise ParseFailure("invalid_escape_sequence", f"Unsupported link target escape \\{escaped}")
                target_chars.append(LINK_TARGET_ESCAPES[escaped])
                continue
            target_chars.append(ch)
        raise ParseFailure("unclosed_inline_construct", "Unterminated link target")
