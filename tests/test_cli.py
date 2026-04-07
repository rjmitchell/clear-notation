from __future__ import annotations

import contextlib
import io
import unittest
from pathlib import Path

from clearnotation_harness.cli import main


REPO_ROOT = Path(__file__).resolve().parent.parent


class CliTests(unittest.TestCase):
    def test_cli_lists_cases(self) -> None:
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            exit_code = main(
                [
                    "--manifest",
                    str(REPO_ROOT / "fixtures/manifest.toml"),
                    "--adapter",
                    "clearnotation_reference.adapter:create_adapter",
                    "--list",
                ]
            )

        self.assertEqual(0, exit_code)
        output = buffer.getvalue()
        self.assertIn("v01\tvalid\tMinimal document", output)
        self.assertIn("x08\tvalidate-invalid\tEmpty heading slug without explicit anchor", output)

    def test_cli_runs_suite(self) -> None:
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            exit_code = main(
                [
                    "--manifest",
                    str(REPO_ROOT / "fixtures/manifest.toml"),
                    "--adapter",
                    "clearnotation_reference.adapter:create_adapter",
                    "--case",
                    "v01",
                    "--case",
                    "x04",
                ]
            )
        self.assertEqual(0, exit_code)
        output = buffer.getvalue()
        self.assertIn("Selected cases: 2", output)
        self.assertIn("[PASS] v01", output)
        self.assertIn("[PASS] x04", output)
