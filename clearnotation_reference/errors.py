"""Error types for the ClearNotation reference implementation."""

from __future__ import annotations


class ClearNotationError(Exception):
    """Base class for ClearNotation errors that carry a kind and message."""

    phase = "unknown"

    def __init__(
        self,
        kind: str,
        message: str,
        *,
        line: int | None = None,
        column: int | None = None,
        suggestion: str | None = None,
    ) -> None:
        super().__init__(message)
        self.kind = kind
        self.message = message
        self.line = line
        self.column = column
        self.suggestion = suggestion


class ParseFailure(ClearNotationError):
    """Raised when parsing fails."""

    phase = "parse"


class ValidationFailure(ClearNotationError):
    """Raised when validation fails."""

    phase = "validate"
