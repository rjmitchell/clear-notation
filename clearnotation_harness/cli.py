"""Command-line interface for the ClearNotation fixture harness."""

from __future__ import annotations

import argparse

from .loader import load_fixture_suite
from .runner import _select_cases, format_suite_result, run_suite
from .runtime import load_adapter


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run ClearNotation parser fixtures from a TOML manifest."
    )
    parser.add_argument(
        "--manifest",
        default="fixtures/manifest.toml",
        help="Path to the fixture manifest TOML file.",
    )
    parser.add_argument(
        "--adapter",
        required=True,
        help="Adapter loader spec in the form module:factory_or_object.",
    )
    parser.add_argument(
        "--case",
        action="append",
        dest="case_ids",
        help="Optional case id to run. Repeat to run multiple cases.",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List the selected cases without running them.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    suite = load_fixture_suite(args.manifest)
    if args.list:
        cases = _select_cases(suite, args.case_ids)
        for case in cases:
            print(f"{case.id}\t{case.kind}\t{case.title}")
        return 0

    adapter = load_adapter(args.adapter)
    result = run_suite(suite, adapter, case_ids=args.case_ids)
    print(format_suite_result(result))
    return 0 if result.ok else 1
