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


class MultipleValidationFailures(Exception):
    """Raised when multiple independent validation errors are found."""

    def __init__(self, errors: list[ValidationFailure]) -> None:
        self.errors = errors
        messages = [
            f"[{e.kind}] {e.message}" + (f" (line {e.line})" if e.line else "")
            for e in errors
        ]
        super().__init__(f"{len(errors)} errors:\n" + "\n".join(messages))


class DiagnosticCollection:
    """Collects multiple validation/parse errors for batch reporting."""

    def __init__(self) -> None:
        self.errors: list[ValidationFailure] = []

    def add(self, error: ValidationFailure) -> None:
        self.errors.append(error)

    def has_errors(self) -> bool:
        return len(self.errors) > 0

    def raise_if_errors(self) -> None:
        if len(self.errors) == 1:
            raise self.errors[0]
        if len(self.errors) > 1:
            raise MultipleValidationFailures(self.errors)
