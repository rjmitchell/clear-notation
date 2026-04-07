"""Suite execution for manifest-driven parser fixtures."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

from .errors import FixtureLoadError, HarnessFailure, ParseFailure, ValidationFailure
from .models import CaseResult, FixtureCase, FixtureSuite, SuiteResult
from .runtime import load_toml_document


def _read_source(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise FixtureLoadError(f"Missing fixture source: {path}") from exc


def _select_cases(suite: FixtureSuite, case_ids: Iterable[str] | None) -> tuple[FixtureCase, ...]:
    if case_ids is None:
        return suite.cases

    wanted = tuple(case_ids)
    by_id = {case.id: case for case in suite.cases}
    missing = [case_id for case_id in wanted if case_id not in by_id]
    if missing:
        raise FixtureLoadError(f"Unknown case id(s): {', '.join(missing)}")
    return tuple(by_id[case_id] for case_id in wanted)


def _error_kind(exc: BaseException) -> str | None:
    return getattr(exc, "kind", None)


def _message(prefix: str, exc: BaseException | None = None) -> str:
    if exc is None:
        return prefix
    detail = getattr(exc, "message", str(exc))
    return f"{prefix}: {detail}"


def _check_required_files(case: FixtureCase) -> None:
    missing = [str(path) for path in case.requires if not path.exists()]
    if missing:
        raise FixtureLoadError(
            f"Fixture case {case.id} is missing required support files: {', '.join(missing)}"
        )


def run_suite(
    suite: FixtureSuite,
    adapter: Any,
    *,
    case_ids: Iterable[str] | None = None,
) -> SuiteResult:
    config = load_toml_document(suite.default_config)
    registry = load_toml_document(suite.builtin_registry)
    selected_cases = _select_cases(suite, case_ids)

    results: list[CaseResult] = []
    for case in selected_cases:
        _check_required_files(case)
        source = _read_source(case.path)

        try:
            document = adapter.parse(
                source,
                path=case.path,
                config=config,
                registry=registry,
            )
        except ParseFailure as exc:
            if case.parse == "reject":
                expected_kind = case.error_kind
                passed = expected_kind is None or expected_kind == exc.kind
                results.append(
                    CaseResult(
                        case=case,
                        passed=passed,
                        phase="parse",
                        message=_message("parse rejected as expected", exc)
                        if passed
                        else _message(
                            f"parse rejected with wrong error kind; expected {expected_kind}",
                            exc,
                        ),
                        observed_error_kind=exc.kind,
                    )
                )
                continue

            results.append(
                CaseResult(
                    case=case,
                    passed=False,
                    phase="parse",
                    message=_message("unexpected parse rejection", exc),
                    observed_error_kind=exc.kind,
                )
            )
            continue
        except HarnessFailure as exc:
            results.append(
                CaseResult(
                    case=case,
                    passed=False,
                    phase=exc.phase,
                    message=_message("unexpected harness failure", exc),
                    observed_error_kind=_error_kind(exc),
                )
            )
            continue
        except Exception as exc:  # pragma: no cover - defensive adapter isolation
            results.append(
                CaseResult(
                    case=case,
                    passed=False,
                    phase="parse",
                    message=_message("unexpected adapter exception", exc),
                    observed_error_kind=_error_kind(exc),
                )
            )
            continue

        if case.parse == "reject":
            results.append(
                CaseResult(
                    case=case,
                    passed=False,
                    phase="parse",
                    message="parse unexpectedly accepted",
                )
            )
            continue

        validate_expectation = case.validate
        if validate_expectation is None:
            results.append(
                CaseResult(
                    case=case,
                    passed=True,
                    phase="parse",
                    message="parse accepted as expected",
                )
            )
            continue

        try:
            adapter.validate(
                document,
                path=case.path,
                config=config,
                registry=registry,
            )
        except ValidationFailure as exc:
            if validate_expectation == "reject":
                expected_kind = case.error_kind
                passed = expected_kind is None or expected_kind == exc.kind
                results.append(
                    CaseResult(
                        case=case,
                        passed=passed,
                        phase="validate",
                        message=_message("validation rejected as expected", exc)
                        if passed
                        else _message(
                            f"validation rejected with wrong error kind; expected {expected_kind}",
                            exc,
                        ),
                        observed_error_kind=exc.kind,
                    )
                )
                continue

            results.append(
                CaseResult(
                    case=case,
                    passed=False,
                    phase="validate",
                    message=_message("unexpected validation rejection", exc),
                    observed_error_kind=exc.kind,
                )
            )
            continue
        except Exception as exc:  # pragma: no cover - defensive adapter isolation
            results.append(
                CaseResult(
                    case=case,
                    passed=False,
                    phase="validate",
                    message=_message("unexpected adapter exception", exc),
                    observed_error_kind=_error_kind(exc),
                )
            )
            continue

        if validate_expectation == "reject":
            results.append(
                CaseResult(
                    case=case,
                    passed=False,
                    phase="validate",
                    message="validation unexpectedly accepted",
                )
            )
            continue

        results.append(
            CaseResult(
                case=case,
                passed=True,
                phase="validate",
                message="parse and validation accepted as expected",
            )
        )

    return SuiteResult(
        suite=suite,
        results=tuple(results),
        selected_case_ids=tuple(case.id for case in selected_cases),
    )


def format_suite_result(result: SuiteResult) -> str:
    lines = [
        f"Suite: {result.suite.manifest_path}",
        f"Selected cases: {len(result.results)}",
        f"Passed: {result.passed}",
        f"Failed: {result.failed}",
    ]
    for case_result in result.results:
        status = "PASS" if case_result.passed else "FAIL"
        lines.append(
            f"[{status}] {case_result.case.id} ({case_result.phase}) - {case_result.message}"
        )
    return "\n".join(lines)
