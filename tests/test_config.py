"""Tests for the config module."""

from __future__ import annotations

import unittest
from pathlib import Path

from clearnotation_reference.config import discover_config, load_config

REPO_ROOT = Path(__file__).resolve().parent.parent


class ConfigTests(unittest.TestCase):
    def test_discover_config_finds_toml(self) -> None:
        result = discover_config(REPO_ROOT / "fixtures" / "valid" / "v01-minimal.cln")
        self.assertIsNotNone(result)
        self.assertTrue(result.name == "clearnotation.toml")

    def test_discover_config_returns_none_for_missing(self) -> None:
        result = discover_config(Path("/tmp/nonexistent/file.cln"))
        self.assertIsNone(result)

    def test_load_config_returns_config_and_registry(self) -> None:
        config, reg_data = load_config(REPO_ROOT / "fixtures" / "valid" / "v01-minimal.cln")
        self.assertIn("spec", config)
        self.assertIn("directive", reg_data)

    def test_bundled_registry_loads(self) -> None:
        _, reg_data = load_config(Path("/tmp/nonexistent/file.cln"))
        self.assertIn("directive", reg_data)
        names = [d["name"] for d in reg_data["directive"]]
        self.assertIn("callout", names)
        self.assertIn("table", names)


if __name__ == "__main__":
    unittest.main()
