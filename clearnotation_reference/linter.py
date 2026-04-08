"""Schema linter for ClearNotation corpora.

Validates all .cln files in a directory against a TOML schema, checking for
required directives and required attributes on directives.
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import load_config
from .errors import ClearNotationError, MultipleValidationFailures
from .models import BlockDirective, BlockNode, Document
from .parser import ReferenceParser
from .registry import Registry
from .validator import ReferenceValidator


@dataclass
class LintIssue:
    path: str
    message: str
    severity: str = "warning"


def lint_corpus(
    root: Path,
    schema_path: Path,
    config_path: str | None = None,
) -> list[LintIssue]:
    """Lint all .cln files under root against the schema.

    Returns a list of LintIssue instances. An empty list means the corpus is
    clean. Files that fail to parse or validate are recorded as error-severity
    issues and skipped for schema checks.
    """
    schema = _load_schema(schema_path)
    profile = _first_profile(schema)

    required_directives: list[str] = profile.get("required_directives", [])
    required_attributes: dict[str, list[str]] = profile.get("required_attributes", {})

    issues: list[LintIssue] = []
    root = root.resolve()

    for cln_path in sorted(root.rglob("*.cln")):
        rel = str(cln_path.relative_to(root))
        doc = _try_parse(cln_path, rel, config_path, issues)
        if doc is None:
            continue

        # Collect all BlockDirective nodes (recursive)
        directives = _collect_directives(doc.blocks)

        # Check required_directives
        present_names = {d.name for d in directives}
        for required in required_directives:
            if required not in present_names:
                issues.append(
                    LintIssue(
                        path=rel,
                        message=f"required directive '{required}' not found in document",
                        severity="warning",
                    )
                )

        # Check required_attributes
        for directive in directives:
            for pattern, attr_names in required_attributes.items():
                if pattern != "*" and pattern != directive.name:
                    continue
                for attr in attr_names:
                    if attr not in directive.attrs:
                        issues.append(
                            LintIssue(
                                path=rel,
                                message=(
                                    f"directive '{directive.name}' is missing required "
                                    f"attribute '{attr}'"
                                ),
                                severity="warning",
                            )
                        )

    return issues


def format_issues(issues: list[LintIssue]) -> str:
    """Format lint issues for terminal output."""
    if not issues:
        return "No issues found."
    lines: list[str] = []
    for issue in issues:
        prefix = "ERROR" if issue.severity == "error" else "WARNING"
        lines.append(f"[{prefix}] {issue.path}: {issue.message}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _load_schema(schema_path: Path) -> dict[str, Any]:
    """Load and return the schema TOML. Raises ValueError on invalid TOML."""
    try:
        with open(schema_path, "rb") as f:
            return tomllib.load(f)
    except tomllib.TOMLDecodeError as exc:
        raise ValueError(f"Invalid schema TOML at {schema_path}: {exc}") from exc


def _first_profile(schema: dict[str, Any]) -> dict[str, Any]:
    """Return the first profile found under [schema.*]."""
    top = schema.get("schema", {})
    for _name, profile in top.items():
        if isinstance(profile, dict):
            return profile
    return {}


def _try_parse(
    cln_path: Path,
    rel: str,
    config_path: str | None,
    issues: list[LintIssue],
) -> Document | None:
    """Attempt to parse and validate a .cln file.

    Returns the Document on success, or None and appends an error-severity
    LintIssue on failure.
    """
    try:
        source = cln_path.read_text(encoding="utf-8")
        config, reg_data = load_config(cln_path, config_path)
        registry = Registry.from_toml(reg_data)
        parser = ReferenceParser(registry)
        parsed_doc = parser.parse_document(source, cln_path)
        validator = ReferenceValidator(registry)
        validator.validate(parsed_doc, config=config)
        validator.diagnostics.raise_if_errors()
        return parsed_doc
    except (ClearNotationError, MultipleValidationFailures, OSError) as exc:
        issues.append(
            LintIssue(
                path=rel,
                message=f"could not parse/validate file: {exc}",
                severity="error",
            )
        )
        return None
    except Exception as exc:  # noqa: BLE001
        issues.append(
            LintIssue(
                path=rel,
                message=f"unexpected error processing file: {exc}",
                severity="error",
            )
        )
        return None


def _collect_directives(blocks: list[BlockNode]) -> list[BlockDirective]:
    """Recursively collect all BlockDirective nodes from a block list."""
    result: list[BlockDirective] = []
    for block in blocks:
        if isinstance(block, BlockDirective):
            result.append(block)
            result.extend(_collect_directives(block.blocks))
    return result
