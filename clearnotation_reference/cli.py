"""CLI entry point for ClearNotation: cln build, cln check, cln ast."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Any

import tomllib

from .diagnostics import Diagnostic, format_diagnostic
from .errors import ClearNotationError
from .normalizer import Normalizer
from .parser import ReferenceParser
from .registry import Registry
from .renderer import render_html
from .validator import ReferenceValidator

from importlib.metadata import version as _pkg_version

try:
    __version__ = _pkg_version("clearnotation")
except Exception:
    __version__ = "0.1.0"

_CSS_FILENAME = "clearnotation.css"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="cln", description="ClearNotation compiler")
    parser.add_argument("--version", action="version", version=f"cln {__version__}")
    sub = parser.add_subparsers(dest="command")

    build_p = sub.add_parser("build", help="Compile .cln to HTML")
    build_p.add_argument("input", help="File or directory to build")
    build_p.add_argument("--output", "-o", help="Output path")
    build_p.add_argument("--config", help="Path to clearnotation.toml")
    build_p.add_argument("--format", choices=["human", "plain", "json"], default=None)

    check_p = sub.add_parser("check", help="Parse and validate without rendering")
    check_p.add_argument("input", help="File or directory to check")
    check_p.add_argument("--config", help="Path to clearnotation.toml")
    check_p.add_argument("--format", choices=["human", "plain", "json"], default=None)

    ast_p = sub.add_parser("ast", help="Output normalized AST as JSON")
    ast_p.add_argument("input", help="File to process")
    ast_p.add_argument("--config", help="Path to clearnotation.toml")
    ast_p.add_argument("--format", choices=["human", "plain", "json"], default=None)

    args = parser.parse_args(argv)
    if args.command is None:
        parser.print_help()
        return 0

    fmt = args.format or ("human" if sys.stderr.isatty() else "plain")

    try:
        if args.command == "build":
            return _cmd_build(Path(args.input), args.output, args.config, fmt)
        if args.command == "check":
            return _cmd_check(Path(args.input), args.config, fmt)
        if args.command == "ast":
            return _cmd_ast(Path(args.input), args.config, fmt)
    except (OSError, UnicodeDecodeError, PermissionError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    return 0


def _cmd_build(input_path: Path, output: str | None, config_path: str | None, fmt: str) -> int:
    if input_path.is_dir():
        return _build_directory(input_path, output, config_path, fmt)
    return _build_file(input_path, Path(output) if output else None, config_path, fmt)


def _build_file(
    input_path: Path,
    output_path: Path | None,
    config_path: str | None,
    fmt: str,
) -> int:
    config, reg_data = _load_config(input_path, config_path)
    registry = Registry.from_toml(reg_data)
    source = input_path.read_text(encoding="utf-8")

    try:
        doc = ReferenceParser(registry).parse_document(source, input_path)
        ReferenceValidator(registry).validate(doc, config=config)
    except ClearNotationError as exc:
        _print_error(exc, source, str(input_path), fmt)
        return 1

    ndoc = Normalizer(registry).normalize(doc)
    if output_path is None:
        output_path = input_path.with_suffix(".html")

    css_rel = _css_relative_path(output_path)
    html = render_html(ndoc, css_path=css_rel)
    output_path.write_text(html, encoding="utf-8")

    # Copy CSS next to output
    css_dest = output_path.parent / _CSS_FILENAME
    if not css_dest.exists():
        css_src = Path(__file__).parent / _CSS_FILENAME
        if css_src.exists():
            shutil.copy2(css_src, css_dest)

    return 0


def _build_directory(
    input_dir: Path,
    output: str | None,
    config_path: str | None,
    fmt: str,
) -> int:
    errors = 0
    output_dir = Path(output) if output else None
    css_copied = False

    for cln_file in sorted(input_dir.rglob("*.cln")):
        if output_dir:
            rel = cln_file.relative_to(input_dir)
            out_file = (output_dir / rel).with_suffix(".html")
            out_file.parent.mkdir(parents=True, exist_ok=True)
        else:
            out_file = None

        result = _build_file(cln_file, out_file, config_path, fmt)
        if result != 0:
            errors += 1

        if not css_copied and result == 0:
            css_copied = True

    return 1 if errors > 0 else 0


def _cmd_check(input_path: Path, config_path: str | None, fmt: str) -> int:
    files = sorted(input_path.rglob("*.cln")) if input_path.is_dir() else [input_path]
    errors = 0
    for f in files:
        config, reg_data = _load_config(f, config_path)
        registry = Registry.from_toml(reg_data)
        source = f.read_text(encoding="utf-8")
        try:
            doc = ReferenceParser(registry).parse_document(source, f)
            ReferenceValidator(registry).validate(doc, config=config)
        except ClearNotationError as exc:
            _print_error(exc, source, str(f), fmt)
            errors += 1
    return 1 if errors > 0 else 0


def _cmd_ast(input_path: Path, config_path: str | None, fmt: str) -> int:
    config, reg_data = _load_config(input_path, config_path)
    registry = Registry.from_toml(reg_data)
    source = input_path.read_text(encoding="utf-8")

    try:
        doc = ReferenceParser(registry).parse_document(source, input_path)
        ReferenceValidator(registry).validate(doc, config=config)
    except ClearNotationError as exc:
        _print_error(exc, source, str(input_path), fmt)
        return 1

    ndoc = Normalizer(registry).normalize(doc)
    print(json.dumps(_ast_to_dict(ndoc), indent=2))
    return 0


def _ast_to_dict(obj: Any) -> Any:
    if hasattr(obj, "__dataclass_fields__"):
        d: dict[str, Any] = {"type": type(obj).__name__}
        for field_name in obj.__dataclass_fields__:
            value = getattr(obj, field_name)
            d[field_name] = _ast_to_dict(value)
        return d
    if isinstance(obj, list):
        return [_ast_to_dict(item) for item in obj]
    if isinstance(obj, dict):
        return {k: _ast_to_dict(v) for k, v in obj.items()}
    if isinstance(obj, Path):
        return str(obj)
    return obj


def _load_config(
    input_path: Path,
    explicit_config: str | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if explicit_config:
        config_file = Path(explicit_config)
    else:
        config_file = _discover_config(input_path)

    if config_file and config_file.exists():
        with open(config_file, "rb") as f:
            config = tomllib.load(f)
    else:
        config = {"spec": "0.1"}

    # Load built-in registry
    builtin_path = Path(__file__).parent.parent / "reference" / "builtin-registry.toml"
    if builtin_path.exists():
        with open(builtin_path, "rb") as f:
            reg_data = tomllib.load(f)
    else:
        reg_data = {}

    return config, reg_data


def _discover_config(input_path: Path) -> Path | None:
    search = input_path.parent if input_path.is_file() else input_path
    for parent in (search, *search.parents):
        candidate = parent / "clearnotation.toml"
        if candidate.exists():
            return candidate
    return None


def _css_relative_path(output_path: Path) -> str:
    return _CSS_FILENAME


def _print_error(exc: ClearNotationError, source: str, file: str, fmt: str) -> None:
    diag = Diagnostic.from_error(exc, file=file)
    source_lines = source.splitlines()
    print(format_diagnostic(diag, source_lines, mode=fmt), file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
