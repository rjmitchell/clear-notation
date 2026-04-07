"""Manifest loading and path resolution for ClearNotation fixtures."""

from __future__ import annotations

from pathlib import Path
import tomllib

from .errors import FixtureLoadError
from .models import FixtureCase, FixtureSuite


def _read_toml(path: Path) -> dict:
    try:
        with path.open("rb") as handle:
            return tomllib.load(handle)
    except FileNotFoundError as exc:
        raise FixtureLoadError(f"Missing TOML file: {path}") from exc
    except tomllib.TOMLDecodeError as exc:
        raise FixtureLoadError(f"Invalid TOML in {path}: {exc}") from exc


def _resolve_relative(base_dir: Path, raw_path: str, field_name: str) -> Path:
    resolved = (base_dir / raw_path).resolve()
    if not resolved.exists():
        raise FixtureLoadError(f"{field_name} path does not exist: {raw_path}")
    return resolved


def load_fixture_suite(manifest_path: str | Path) -> FixtureSuite:
    manifest = Path(manifest_path).resolve()
    data = _read_toml(manifest)
    base_dir = manifest.parent

    try:
        suite = data["suite"]
        case_rows = data["case"]
    except KeyError as exc:
        raise FixtureLoadError(f"Missing required manifest section: {exc}") from exc

    project_root = _resolve_relative(base_dir, data["project_root"], "project_root")
    default_config = _resolve_relative(base_dir, data["default_config"], "default_config")
    builtin_registry = _resolve_relative(base_dir, data["builtin_registry"], "builtin_registry")
    document_extension = suite["document_extension"]

    cases: list[FixtureCase] = []
    seen_ids: set[str] = set()
    for row in case_rows:
        case_id = row["id"]
        if case_id in seen_ids:
            raise FixtureLoadError(f"Duplicate case id in manifest: {case_id}")
        seen_ids.add(case_id)

        case_path = _resolve_relative(base_dir, row["path"], f"case {case_id}")
        if case_path.suffix != document_extension:
            raise FixtureLoadError(
                f"Case {case_id} has unexpected extension {case_path.suffix}; "
                f"expected {document_extension}"
            )

        requires = tuple(
            _resolve_relative(base_dir, required, f"case {case_id} requires")
            for required in row.get("requires", [])
        )

        validate = row.get("validate")
        if validate is None and row["kind"] != "parse-invalid":
            raise FixtureLoadError(f"Case {case_id} is missing validate expectation")

        cases.append(
            FixtureCase(
                id=case_id,
                title=row["title"],
                kind=row["kind"],
                path=case_path,
                parse=row["parse"],
                validate=validate,
                error_kind=row.get("error_kind"),
                requires=requires,
            )
        )

    return FixtureSuite(
        manifest_path=manifest,
        project_root=project_root,
        default_config=default_config,
        builtin_registry=builtin_registry,
        document_extension=document_extension,
        cases=tuple(cases),
    )
