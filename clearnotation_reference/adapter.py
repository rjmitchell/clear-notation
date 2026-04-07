"""Thin adapter wrapper around the split reference parser and validator modules."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .models import Document
from .parser import ReferenceParser
from .registry import Registry
from .validator import ReferenceValidator


class ReferenceAdapter:
    def parse(
        self,
        source: str,
        *,
        path: Path,
        config: dict[str, Any],
        registry: dict[str, Any],
    ) -> Document:
        parsed_registry = Registry.from_toml(registry)
        parser = ReferenceParser(parsed_registry)
        return parser.parse_document(source, path)

    def validate(
        self,
        document: Document,
        *,
        path: Path,
        config: dict[str, Any],
        registry: dict[str, Any],
    ) -> None:
        parsed_registry = Registry.from_toml(registry)
        validator = ReferenceValidator(parsed_registry)
        validator.validate(document, config=config)


def create_adapter() -> ReferenceAdapter:
    return ReferenceAdapter()
