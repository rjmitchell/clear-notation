"""Shared runtime helpers for the fixture harness."""

from __future__ import annotations

from importlib import import_module
from pathlib import Path
import tomllib
from typing import Any

from .errors import FixtureLoadError


def load_toml_document(path: Path) -> dict[str, Any]:
    try:
        with path.open("rb") as handle:
            data = tomllib.load(handle)
    except FileNotFoundError as exc:
        raise FixtureLoadError(f"Missing runtime TOML file: {path}") from exc
    except tomllib.TOMLDecodeError as exc:
        raise FixtureLoadError(f"Invalid runtime TOML file {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise FixtureLoadError(f"Unexpected TOML root in {path}")
    return data


def load_adapter(spec: str) -> Any:
    if ":" not in spec:
        raise FixtureLoadError(
            "Adapter spec must use the form 'module:factory_or_object'"
        )

    module_name, attribute_name = spec.split(":", 1)
    if not module_name or not attribute_name:
        raise FixtureLoadError(
            "Adapter spec must use the form 'module:factory_or_object'"
        )

    module = import_module(module_name)
    target = getattr(module, attribute_name)

    # If the target already looks like an adapter object, use it directly.
    if hasattr(target, "parse") and hasattr(target, "validate"):
        return target

    adapter = target()
    if not hasattr(adapter, "parse") or not hasattr(adapter, "validate"):
        raise FixtureLoadError(
            f"Resolved adapter {spec} does not provide parse() and validate()"
        )
    return adapter
