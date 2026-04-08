from __future__ import annotations

import unittest
from pathlib import Path

from clearnotation_harness import load_fixture_suite


REPO_ROOT = Path(__file__).resolve().parent.parent


class FixtureLoaderTests(unittest.TestCase):
    def test_loads_repo_fixture_manifest(self) -> None:
        suite = load_fixture_suite(REPO_ROOT / "fixtures/manifest.toml")

        self.assertEqual(".cln", suite.document_extension)
        self.assertEqual(REPO_ROOT / "clearnotation.toml", suite.default_config)
        self.assertEqual(
            REPO_ROOT / "reference/builtin-registry.toml",
            suite.builtin_registry,
        )
        self.assertEqual(53, len(suite.cases))
        self.assertEqual("v01", suite.cases[0].id)
        self.assertEqual("x18", suite.cases[-1].id)


if __name__ == "__main__":
    unittest.main()
