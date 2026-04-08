"""Configuration loading for ClearNotation projects."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import tomllib


def discover_config(input_path: Path) -> Path | None:
    """Walk up from *input_path* to find ``clearnotation.toml``."""
    search = input_path.parent if input_path.is_file() else input_path
    for parent in (search, *search.parents):
        candidate = parent / "clearnotation.toml"
        if candidate.exists():
            return candidate
    return None


def load_config(
    input_path: Path,
    explicit_config: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Return ``(config, registry_data)`` for a build/check/ast run.

    *explicit_config* overrides automatic discovery.
    """
    if explicit_config:
        config_file = Path(explicit_config)
    else:
        config_file = discover_config(input_path)

    if config_file and config_file.exists():
        with open(config_file, "rb") as f:
            config = tomllib.load(f)
    else:
        config = {"spec": "0.1"}

    # Load built-in registry
    builtin_path = Path(__file__).parent / "builtin-registry.toml"
    if builtin_path.exists():
        with open(builtin_path, "rb") as f:
            reg_data = tomllib.load(f)
    else:
        reg_data = {}

    # Merge user-defined directives from clearnotation.toml into the registry
    user_directives = config.get("directive", [])
    if user_directives:
        existing = reg_data.setdefault("directive", [])
        existing_names = {d["name"] for d in existing}
        for d in user_directives:
            if d.get("name") and d["name"] not in existing_names:
                existing.append(d)

    return config, reg_data
