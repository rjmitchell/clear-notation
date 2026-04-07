"""Processor adapter contract used by the fixture harness."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol


class ProcessorAdapter(Protocol):
    """Minimal parser/validator surface required by the harness."""

    def parse(
        self,
        source: str,
        *,
        path: Path,
        config: dict[str, Any],
        registry: dict[str, Any],
    ) -> Any:
        """Parse a document or raise ParseFailure."""

    def validate(
        self,
        document: Any,
        *,
        path: Path,
        config: dict[str, Any],
        registry: dict[str, Any],
    ) -> None:
        """Validate a parsed document or raise ValidationFailure."""
