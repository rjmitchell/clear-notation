from __future__ import annotations

import unittest
from pathlib import Path

from clearnotation_harness import load_fixture_suite, run_suite
from clearnotation_reference.adapter import create_adapter


REPO_ROOT = Path(__file__).resolve().parent.parent


class FixtureRunnerTests(unittest.TestCase):
    def test_full_manifest_runs_cleanly_with_reference_adapter(self) -> None:
        suite = load_fixture_suite(REPO_ROOT / "fixtures/manifest.toml")
        result = run_suite(suite, create_adapter())

        self.assertTrue(result.ok)
        self.assertEqual(55, len(result.results))
        self.assertEqual(55, result.passed)
        self.assertEqual(0, result.failed)

    def test_subset_selection_runs_only_requested_cases(self) -> None:
        suite = load_fixture_suite(REPO_ROOT / "fixtures/manifest.toml")
        result = run_suite(suite, create_adapter(), case_ids=["v01", "x04"])

        self.assertEqual(("v01", "x04"), result.selected_case_ids)
        self.assertEqual(2, len(result.results))
        self.assertTrue(result.ok)


if __name__ == "__main__":
    unittest.main()
