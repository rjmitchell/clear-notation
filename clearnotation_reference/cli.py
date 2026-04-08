"""CLI entry point for ClearNotation: cln build, cln check, cln ast, cln init, cln watch."""

from __future__ import annotations

import argparse
import http.server
import json
import shutil
import sys
import threading
from pathlib import Path
from typing import Any

from .config import load_config
from .diagnostics import Diagnostic, format_diagnostic
from .errors import ClearNotationError, MultipleValidationFailures
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

INIT_CONFIG = """\
[spec]
version = "0.1"

[project]
root = "."

# Custom directives (uncomment and modify):
# [[directive]]
# name = "custom"
# placement = "block"
# body_mode = "parsed"
"""

INIT_DOCUMENT = """\
::meta{
title = "My Project"
}

# Welcome to My Project

This is a ClearNotation document. Edit this file to get started.

## Getting Started

- Run `cln build docs/index.cln` to generate HTML
- Run `cln check docs/index.cln` to validate
- Run `cln fmt docs/index.cln` to format

## Features

ClearNotation supports +{strong text}, *{emphasized text}, `inline code`, and [links -> https://clearnotation.dev].

::callout[kind="info", title="Tip"]{
Use the `::callout` directive for callouts, tips, and warnings.
}
"""


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

    fmt_p = sub.add_parser("fmt", help="Format .cln source")
    fmt_p.add_argument("input", help="File to format")
    fmt_p.add_argument("--write", "-w", action="store_true", help="Write formatted output back to file")
    fmt_p.add_argument("--check", action="store_true", help="Exit 1 if file would change (for CI)")
    fmt_p.add_argument("--config", help="Path to clearnotation.toml")

    init_p = sub.add_parser("init", help="Create a new ClearNotation project")
    init_p.add_argument("directory", nargs="?", default=".", help="Target directory (default: current)")

    watch_p = sub.add_parser("watch", help="Watch files and rebuild on change")
    watch_p.add_argument("input", help="Source .cln file or directory")
    watch_p.add_argument("--output", "-o", default="dist", help="Output directory")
    watch_p.add_argument("--port", "-p", type=int, default=8000, help="Server port")
    watch_p.add_argument("--config", help="Path to clearnotation.toml")
    watch_p.add_argument("--format", choices=["human", "plain", "json"], default=None)

    args = parser.parse_args(argv)
    if args.command is None:
        parser.print_help()
        return 0

    fmt = getattr(args, "format", None) or ("human" if sys.stderr.isatty() else "plain")

    try:
        if args.command == "init":
            return _cmd_init(args)
        if args.command == "build":
            return _cmd_build(Path(args.input), args.output, args.config, fmt)
        if args.command == "check":
            return _cmd_check(Path(args.input), args.config, fmt)
        if args.command == "ast":
            return _cmd_ast(Path(args.input), args.config, fmt)
        if args.command == "fmt":
            return _cmd_fmt(Path(args.input), args.write, args.check, args.config)
        if args.command == "watch":
            return _cmd_watch(Path(args.input), args.output, args.port, args.config, fmt)
    except (OSError, UnicodeDecodeError, PermissionError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    return 0


def _cmd_init(args: argparse.Namespace) -> int:
    """Scaffold a new ClearNotation project."""
    target = Path(args.directory or ".")
    if (target / "clearnotation.toml").exists():
        print(f"clearnotation.toml already exists in {target}", file=sys.stderr)
        return 1

    target.mkdir(parents=True, exist_ok=True)
    (target / "clearnotation.toml").write_text(INIT_CONFIG)
    docs = target / "docs"
    docs.mkdir(exist_ok=True)
    (docs / "index.cln").write_text(INIT_DOCUMENT)
    print(f"Created ClearNotation project in {target}")
    print(f"  clearnotation.toml")
    print(f"  docs/index.cln")
    print(f"\nNext: cln build docs/index.cln")
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
    config, reg_data = load_config(input_path, config_path)
    registry = Registry.from_toml(reg_data)
    source = input_path.read_text(encoding="utf-8")

    try:
        doc = ReferenceParser(registry).parse_document(source, input_path)
        ReferenceValidator(registry).validate(doc, config=config)
    except MultipleValidationFailures as exc:
        for err in exc.errors:
            _print_error(err, source, str(input_path), fmt)
        return 1
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
        config, reg_data = load_config(f, config_path)
        registry = Registry.from_toml(reg_data)
        source = f.read_text(encoding="utf-8")
        try:
            doc = ReferenceParser(registry).parse_document(source, f)
            ReferenceValidator(registry).validate(doc, config=config)
        except MultipleValidationFailures as exc:
            for err in exc.errors:
                _print_error(err, source, str(f), fmt)
            errors += 1
        except ClearNotationError as exc:
            _print_error(exc, source, str(f), fmt)
            errors += 1
    return 1 if errors > 0 else 0


def _cmd_ast(input_path: Path, config_path: str | None, fmt: str) -> int:
    config, reg_data = load_config(input_path, config_path)
    registry = Registry.from_toml(reg_data)
    source = input_path.read_text(encoding="utf-8")

    try:
        doc = ReferenceParser(registry).parse_document(source, input_path)
        ReferenceValidator(registry).validate(doc, config=config)
    except MultipleValidationFailures as exc:
        for err in exc.errors:
            _print_error(err, source, str(input_path), fmt)
        return 1
    except ClearNotationError as exc:
        _print_error(exc, source, str(input_path), fmt)
        return 1

    ndoc = Normalizer(registry).normalize(doc)
    print(json.dumps(_ast_to_dict(ndoc), indent=2))
    return 0


def _cmd_fmt(input_path: Path, write: bool, check: bool, config_path: str | None) -> int:
    from .formatter import Formatter

    config, reg_data = load_config(input_path, config_path)
    registry = Registry.from_toml(reg_data)
    source = input_path.read_text(encoding="utf-8")

    try:
        formatter = Formatter(registry)
        formatted = formatter.format(source)
    except ClearNotationError as exc:
        _print_error(exc, source, str(input_path), "human")
        return 1

    if check:
        return 0 if formatted == source else 1

    if write:
        input_path.write_text(formatted, encoding="utf-8")
        return 0

    sys.stdout.write(formatted)
    return 0


def _cmd_watch(
    input_path: Path,
    output: str,
    port: int,
    config_path: str | None,
    fmt: str,
) -> int:
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler
    except ImportError:
        print(
            "error: watchdog is required for cln watch.\n"
            "Install it with: pip install clearnotation[watch]",
            file=sys.stderr,
        )
        return 1

    out_dir = Path(output)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Initial build
    if input_path.is_dir():
        result = _build_directory(input_path, output, config_path, fmt)
    else:
        out_file = (out_dir / input_path.name).with_suffix(".html")
        result = _build_file(input_path, out_file, config_path, fmt)

    if result != 0:
        print("warning: initial build had errors", file=sys.stderr)

    print(f"Built to {out_dir}/")

    # Start HTTP server in a daemon thread
    handler_class = http.server.SimpleHTTPRequestHandler
    server = http.server.HTTPServer(
        ("", port),
        lambda *a, **kw: handler_class(*a, directory=str(out_dir.resolve()), **kw),
    )
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    print(f"Serving at http://localhost:{port}")

    # Determine watch directory
    watch_dir = str(input_path if input_path.is_dir() else input_path.parent)

    class _RebuildHandler(FileSystemEventHandler):
        """Rebuild .cln files when they change on disk."""

        def on_modified(self, event):  # type: ignore[override]
            if event.is_directory:
                return
            if not event.src_path.endswith(".cln"):
                return
            changed = Path(event.src_path)
            print(f"Changed: {changed}")
            try:
                if input_path.is_dir():
                    rel = changed.relative_to(input_path)
                    dest = (out_dir / rel).with_suffix(".html")
                    dest.parent.mkdir(parents=True, exist_ok=True)
                else:
                    dest = (out_dir / changed.name).with_suffix(".html")
                _build_file(changed, dest, config_path, fmt)
                print(f"Rebuilt {changed}")
            except Exception as exc:
                print(f"Build error: {exc}", file=sys.stderr)

    observer = Observer()
    observer.schedule(_RebuildHandler(), watch_dir, recursive=True)
    observer.start()
    print(f"Watching {watch_dir} for changes...")
    print("Press Ctrl+C to stop")

    try:
        observer.join()
    except KeyboardInterrupt:
        print("\nStopping...")
        observer.stop()
        server.shutdown()
        server.server_close()
    observer.join()
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


def _css_relative_path(output_path: Path) -> str:
    return _CSS_FILENAME


def _print_error(exc: ClearNotationError, source: str, file: str, fmt: str) -> None:
    diag = Diagnostic.from_error(exc, file=file)
    source_lines = source.splitlines()
    print(format_diagnostic(diag, source_lines, mode=fmt), file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
