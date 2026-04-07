"""Literal parsing shared by metadata and directive attribute parsing."""

from __future__ import annotations

from typing import Any

from .errors import ParseFailure

from .patterns import DOTTED_IDENTIFIER_RE, IDENTIFIER_RE, STRING_ESCAPES


class LiteralParser:
    def __init__(self, text: str, *, parse_failure: type[ParseFailure] | None = None) -> None:
        self.text = text
        self.pos = 0
        self._parse_failure = parse_failure or ParseFailure

    def skip_ws(self) -> None:
        while self.pos < len(self.text) and self.text[self.pos] in " \t":
            self.pos += 1

    def eof(self) -> bool:
        self.skip_ws()
        return self.pos >= len(self.text)

    def parse_identifier(self, *, dotted: bool = False) -> str:
        pattern = DOTTED_IDENTIFIER_RE if dotted else IDENTIFIER_RE
        match = pattern.match(self.text, self.pos)
        if match is None:
            raise self._parse_failure("invalid_literal", "Expected identifier")
        self.pos = match.end()
        return match.group(0)

    def expect(self, token: str) -> None:
        if not self.text.startswith(token, self.pos):
            raise self._parse_failure("invalid_literal", f"Expected {token!r}")
        self.pos += len(token)

    def parse_string(self) -> str:
        self.expect('"')
        chars: list[str] = []
        while self.pos < len(self.text):
            ch = self.text[self.pos]
            self.pos += 1
            if ch == '"':
                return "".join(chars)
            if ch == "\\":
                if self.pos >= len(self.text):
                    raise self._parse_failure("invalid_literal", "Unterminated string escape")
                escaped = self.text[self.pos]
                self.pos += 1
                if escaped not in STRING_ESCAPES:
                    raise self._parse_failure("invalid_literal", f"Unsupported string escape \\{escaped}")
                chars.append(STRING_ESCAPES[escaped])
                continue
            chars.append(ch)
        raise self._parse_failure("invalid_literal", "Unterminated string")

    def parse_integer(self) -> int:
        start = self.pos
        if self.pos < len(self.text) and self.text[self.pos] == "-":
            self.pos += 1
        if self.pos >= len(self.text) or not self.text[self.pos].isdigit():
            raise self._parse_failure("invalid_literal", "Expected integer")
        while self.pos < len(self.text) and self.text[self.pos].isdigit():
            self.pos += 1
        return int(self.text[start:self.pos])

    def parse_array(self) -> list[Any]:
        self.expect("[")
        values: list[Any] = []
        self.skip_ws()
        if self.pos < len(self.text) and self.text[self.pos] == "]":
            self.pos += 1
            return values
        while True:
            self.skip_ws()
            values.append(self.parse_value())
            self.skip_ws()
            if self.pos >= len(self.text):
                raise self._parse_failure("invalid_literal", "Unterminated array")
            if self.text[self.pos] == "]":
                self.pos += 1
                return values
            if self.text[self.pos] != ",":
                raise self._parse_failure("invalid_literal", "Expected ',' or ']' in array")
            self.pos += 1

    def parse_value(self) -> Any:
        self.skip_ws()
        if self.pos >= len(self.text):
            raise self._parse_failure("invalid_literal", "Expected value")
        ch = self.text[self.pos]
        if ch == '"':
            return self.parse_string()
        if ch == "[":
            return self.parse_array()
        if self.text.startswith("true", self.pos):
            self.pos += 4
            return True
        if self.text.startswith("false", self.pos):
            self.pos += 5
            return False
        if ch == "-" or ch.isdigit():
            return self.parse_integer()
        raise self._parse_failure("invalid_literal", f"Unsupported value starting with {ch!r}")

    def parse_attribute_list(self) -> tuple[dict[str, Any], int]:
        attrs: dict[str, Any] = {}
        self.expect("[")
        self.skip_ws()
        if self.pos < len(self.text) and self.text[self.pos] == "]":
            self.pos += 1
            return attrs, self.pos
        while True:
            self.skip_ws()
            key = self.parse_identifier()
            self.skip_ws()
            self.expect("=")
            value = self.parse_value()
            attrs[key] = value
            self.skip_ws()
            if self.pos >= len(self.text):
                raise self._parse_failure("invalid_literal", "Unterminated attribute list")
            if self.text[self.pos] == "]":
                self.pos += 1
                return attrs, self.pos
            if self.text[self.pos] != ",":
                raise self._parse_failure("invalid_literal", "Expected ',' or ']' in attribute list")
            self.pos += 1
