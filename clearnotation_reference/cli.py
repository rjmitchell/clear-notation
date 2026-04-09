"""CLI entry point for ClearNotation: cln build, cln check, cln ast, cln init, cln watch, cln convert, cln index, cln query, cln lint."""

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
    __version__ = "0.9.0"

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

    convert_p = sub.add_parser("convert", help="Convert Markdown files to CLN")
    convert_p.add_argument("input", help="Markdown file or directory to convert")
    convert_p.add_argument("--output", "-o", help="Output path (file or directory)")
    convert_p.add_argument("--report", help="Write conversion report to this file")

    index_p = sub.add_parser("index", help="Index .cln files into a queryable database")
    index_p.add_argument("input", nargs="?", default=".", help="Directory to index (default: .)")
    index_p.add_argument("--config", help="Path to clearnotation.toml")

    query_p = sub.add_parser("query", help="Query the CLN index")
    query_p.add_argument("--directive", help="Filter by directive name")
    query_p.add_argument("--references", help="Filter by reference target")
    query_p.add_argument("--title", help="Filter by document title (substring)")
    query_p.add_argument("--attribute", help="Filter by attribute key=value")
    query_p.add_argument("--stats", action="store_true", help="Show corpus statistics")
    query_p.add_argument("input", nargs="?", default=".", help="Project root (default: .)")

    lint_p = sub.add_parser("lint", help="Validate CLN corpus against a schema")
    lint_p.add_argument("input", help="Directory to lint")
    lint_p.add_argument("--schema", required=True, help="Path to schema TOML file")
    lint_p.add_argument("--config", help="Path to clearnotation.toml")

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
        if args.command == "convert":
            return _cmd_convert(Path(args.input), args.output, getattr(args, "report", None))
        if args.command == "index":
            return _cmd_index(Path(args.input), getattr(args, "config", None))
        if args.command == "query":
            return _cmd_query(Path(args.input), args)
        if args.command == "lint":
            return _cmd_lint(Path(args.input), args.schema, getattr(args, "config", None))
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


def _parse_and_normalize(
    input_path: Path,
    config_path: str | None = None,
) -> tuple["NormalizedDocument", "Registry", "Document"]:
    """Parse, validate, and normalize a .cln file. Returns (normalized_doc, registry, parsed_doc).

    Raises ClearNotationError or MultipleValidationFailures on failure.
    """
    config, reg_data = load_config(input_path, config_path)
    registry = Registry.from_toml(reg_data)
    source = input_path.read_text(encoding="utf-8")
    doc = ReferenceParser(registry).parse_document(source, input_path)
    ReferenceValidator(registry).validate(doc, config=config)
    ndoc = Normalizer(registry).normalize(doc, source_path=input_path, config=config)
    return ndoc, registry, doc


def extract_includes(doc: "Document", source_path: Path) -> set[Path]:
    """Extract resolved include paths from a parsed document."""
    from .models import BlockDirective

    result: set[Path] = set()
    _walk_includes(doc.blocks, source_path, result)
    return result


def _walk_includes(
    blocks: list,
    source_path: Path,
    result: set[Path],
) -> None:
    from .models import BlockDirective

    for block in blocks:
        if isinstance(block, BlockDirective):
            if block.name == "include":
                src = block.attrs.get("src")
                if src:
                    target = (source_path.parent / src).resolve()
                    result.add(target)
            _walk_includes(block.blocks, source_path, result)


def files_to_rebuild(
    changed: Path,
    included_by: dict[Path, set[Path]],
) -> set[Path]:
    """Walk up the include tree to find all files that need rebuilding."""
    result = {changed}
    queue = [changed]
    while queue:
        f = queue.pop()
        for parent in included_by.get(f, set()):
            if parent not in result:
                result.add(parent)
                queue.append(parent)
    return result


class IncludeGraph:
    """Tracks forward and reverse include dependencies for cln watch."""

    def __init__(self) -> None:
        self._includes: dict[Path, set[Path]] = {}
        self._included_by: dict[Path, set[Path]] = {}

    def update(self, source: Path, includes: set[Path]) -> None:
        """Replace the include set for *source*, updating the reverse map."""
        for old_target in self._includes.get(source, set()):
            refs = self._included_by.get(old_target)
            if refs is not None:
                refs.discard(source)
                if not refs:
                    del self._included_by[old_target]
        if includes:
            self._includes[source] = set(includes)
        else:
            self._includes.pop(source, None)
        for target in includes:
            self._included_by.setdefault(target, set()).add(source)

    def files_to_rebuild(self, changed: Path) -> set[Path]:
        """Return *changed* plus all transitive includers."""
        return files_to_rebuild(changed, self._included_by)


def _cmd_build(input_path: Path, output: str | None, config_path: str | None, fmt: str) -> int:
    if input_path.is_dir():
        return _build_directory(input_path, output, config_path, fmt)
    return _build_file(input_path, Path(output) if output else None, config_path, fmt)


def _build_file(
    input_path: Path,
    output_path: Path | None,
    config_path: str | None,
    fmt: str,
    *,
    return_doc: bool = False,
):
    try:
        ndoc, registry, doc = _parse_and_normalize(input_path, config_path)
    except MultipleValidationFailures as exc:
        source = input_path.read_text(encoding="utf-8")
        for err in exc.errors:
            _print_error(err, source, str(input_path), fmt)
        return (1, None) if return_doc else 1
    except ClearNotationError as exc:
        source = input_path.read_text(encoding="utf-8")
        _print_error(exc, source, str(input_path), fmt)
        return (1, None) if return_doc else 1

    if output_path is None:
        output_path = input_path.with_suffix(".html")

    css_rel = _css_relative_path(output_path)
    html = render_html(ndoc, css_path=css_rel)
    output_path.write_text(html, encoding="utf-8")

    css_dest = output_path.parent / _CSS_FILENAME
    if not css_dest.exists():
        css_src = Path(__file__).parent / _CSS_FILENAME
        if css_src.exists():
            shutil.copy2(css_src, css_dest)

    return (0, doc) if return_doc else 0


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

    ndoc = Normalizer(registry).normalize(doc, source_path=input_path, config=config)
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

    # Dependency graph for include-aware rebuilds
    graph = IncludeGraph()

    # Initial build
    if input_path.is_dir():
        result = _build_directory(input_path, output, config_path, fmt)
        # Populate the graph with a lightweight parse of each .cln file
        for cln_file in sorted(input_path.rglob("*.cln")):
            try:
                config, reg_data = load_config(cln_file, config_path)
                registry = Registry.from_toml(reg_data)
                source = cln_file.read_text(encoding="utf-8")
                doc = ReferenceParser(registry).parse_document(source, cln_file)
                resolved = cln_file.resolve()
                graph.update(resolved, extract_includes(doc, resolved))
            except Exception:
                pass  # skip files that fail to parse
    else:
        out_file = (out_dir / input_path.name).with_suffix(".html")
        rc, doc = _build_file(input_path, out_file, config_path, fmt, return_doc=True)
        result = rc
        if doc is not None:
            resolved = input_path.resolve()
            graph.update(resolved, extract_includes(doc, resolved))

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
            changed = Path(event.src_path).resolve()
            print(f"Changed: {changed}")
            try:
                to_rebuild = graph.files_to_rebuild(changed)
                for rebuild_path in sorted(to_rebuild):
                    if input_path.is_dir():
                        rel = rebuild_path.relative_to(input_path.resolve())
                        dest = (out_dir / rel).with_suffix(".html")
                        dest.parent.mkdir(parents=True, exist_ok=True)
                    else:
                        dest = (out_dir / rebuild_path.name).with_suffix(".html")
                    rc, doc = _build_file(rebuild_path, dest, config_path, fmt, return_doc=True)
                    if rc == 0 and doc is not None:
                        graph.update(rebuild_path, extract_includes(doc, rebuild_path))
                    print(f"Rebuilt {rebuild_path}")
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


def _cmd_convert(input_path: Path, output: str | None, report: str | None) -> int:
    try:
        from .converter import convert_file
    except ImportError:
        print(
            "error: mistune is required for Markdown conversion.\n"
            "Install it with: pip install clearnotation[convert]",
            file=sys.stderr,
        )
        return 1

    if input_path.is_dir():
        md_files = sorted(input_path.rglob("*.md"))
        if not md_files:
            print(f"No .md files found in {input_path}", file=sys.stderr)
            return 1
        out_dir = Path(output) if output else input_path
        errors = 0
        total_loss = 0.0
        for md_file in md_files:
            rel = md_file.relative_to(input_path)
            cln_file = (out_dir / rel).with_suffix(".cln")
            cln_file.parent.mkdir(parents=True, exist_ok=True)
            try:
                rpt = (out_dir / rel).with_suffix(".convert-report.txt") if report else None
                r = convert_file(md_file, cln_file, report_path=rpt)
                total_loss += r.loss_percent
                status = f" ({r.loss_percent:.0f}% loss)" if r.skipped_lines else ""
                print(f"  {md_file} -> {cln_file}{status}")
            except Exception as exc:
                print(f"  error: {md_file}: {exc}", file=sys.stderr)
                errors += 1
        avg_loss = total_loss / len(md_files) if md_files else 0
        print(f"\nConverted {len(md_files) - errors}/{len(md_files)} files (avg {avg_loss:.1f}% content loss)")
        return 1 if errors > 0 else 0
    else:
        out_path = Path(output) if output else input_path.with_suffix(".cln")
        rpt_path = Path(report) if report else None
        try:
            r = convert_file(input_path, out_path, report_path=rpt_path)
            status = f" ({r.loss_percent:.0f}% loss)" if r.skipped_lines else ""
            print(f"{input_path} -> {out_path}{status}")
            for s in r.skipped:
                print(f"  warning: line {s.line}: {s.reason}", file=sys.stderr)
            return 0
        except Exception as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1


def _cmd_index(input_path: Path, config_path: str | None) -> int:
    from .indexer import index_directory
    try:
        stats = index_directory(input_path, config_path=config_path)
        print(f"Indexed: {stats.indexed} files")
        if stats.unchanged:
            print(f"Unchanged: {stats.unchanged} files")
        if stats.skipped:
            print(f"Skipped: {stats.skipped} files (errors)")
        for err in stats.errors:
            print(f"  {err}", file=sys.stderr)
        return 1 if stats.skipped > 0 else 0
    except OSError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


def _cmd_query(input_path: Path, args: argparse.Namespace) -> int:
    from .query import (
        query_index, corpus_stats, check_and_warn_staleness,
        format_results, format_stats,
    )

    if check_and_warn_staleness(input_path):
        print("warning: index may be stale. Run 'cln index' to refresh.", file=sys.stderr)

    try:
        if args.stats:
            stats = corpus_stats(input_path)
            print(format_stats(stats))
            return 0

        results = query_index(
            input_path,
            directive=args.directive,
            references=args.references,
            title=args.title,
            attribute=args.attribute,
        )
        print(format_results(results))
        return 0
    except FileNotFoundError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


def _cmd_lint(input_path: Path, schema: str, config_path: str | None) -> int:
    from .linter import lint_corpus, format_issues
    try:
        issues = lint_corpus(input_path, Path(schema), config_path=config_path)
        if issues:
            print(format_issues(issues))
            return 1
        print("No lint issues found.")
        return 0
    except (ValueError, FileNotFoundError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


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
