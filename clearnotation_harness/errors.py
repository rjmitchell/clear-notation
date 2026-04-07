"""Harness-specific exception types.

ParseFailure and ValidationFailure are re-exported from the reference
implementation package so that existing imports from the harness continue
to work.
"""

from __future__ import annotations

from clearnotation_reference.errors import (
    ClearNotationError as HarnessFailure,
    ParseFailure,
    ValidationFailure,
)


class FixtureLoadError(RuntimeError):
    """Raised when the fixture manifest or its referenced files are invalid."""
