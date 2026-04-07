"""Typed models for fixture suites and run results."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

CaseKind = Literal["valid", "parse-invalid", "validate-invalid"]
PhaseExpectation = Literal["accept", "reject"]


@dataclass(frozen=True)
class FixtureCase:
    id: str
    title: str
    kind: CaseKind
    path: Path
    parse: PhaseExpectation
    validate: PhaseExpectation | None = None
    error_kind: str | None = None
    requires: tuple[Path, ...] = ()


@dataclass(frozen=True)
class FixtureSuite:
    manifest_path: Path
    project_root: Path
    default_config: Path
    builtin_registry: Path
    document_extension: str
    cases: tuple[FixtureCase, ...]


@dataclass(frozen=True)
class CaseResult:
    case: FixtureCase
    passed: bool
    phase: str
    message: str
    observed_error_kind: str | None = None


@dataclass(frozen=True)
class SuiteResult:
    suite: FixtureSuite
    results: tuple[CaseResult, ...]
    selected_case_ids: tuple[str, ...] = field(default_factory=tuple)

    @property
    def passed(self) -> int:
        return sum(1 for result in self.results if result.passed)

    @property
    def failed(self) -> int:
        return len(self.results) - self.passed

    @property
    def ok(self) -> bool:
        return self.failed == 0
