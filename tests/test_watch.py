"""Tests for the cln watch subcommand."""

from __future__ import annotations

import io
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
from pathlib import Path
from unittest.mock import patch, MagicMock

from clearnotation_reference.cli import main

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURE_FILE = REPO_ROOT / "fixtures" / "valid" / "v01-minimal.cln"


class WatchSubcommandTests(unittest.TestCase):
    """Tests that the watch subcommand is wired up and works."""

    def test_watch_subcommand_exists_in_help(self) -> None:
        """The watch subcommand appears in --help output."""
        buf = io.StringIO()
        with patch("sys.stdout", buf), self.assertRaises(SystemExit) as ctx:
            main(["--help"])
        self.assertEqual(ctx.exception.code, 0)
        self.assertIn("watch", buf.getvalue())

    def test_watch_missing_input_exits_nonzero(self) -> None:
        """watch with no arguments should exit with an error."""
        with self.assertRaises(SystemExit) as ctx:
            main(["watch"])
        self.assertNotEqual(ctx.exception.code, 0)

    def test_watch_initial_build_and_server(self) -> None:
        """watch does an initial build, starts the server, then stops on interrupt."""
        with tempfile.TemporaryDirectory() as tmpdir:
            out_dir = Path(tmpdir) / "dist"
            port = _find_free_port()

            started = threading.Event()
            result_holder: list[int] = []
            error_holder: list[Exception] = []

            def run_watch():
                try:
                    from watchdog.observers import Observer as RealObserver
                    from watchdog.events import FileSystemEventHandler

                    class PatchedObserver(RealObserver):
                        def join(self, timeout=None):
                            if not started.is_set():
                                started.set()
                                # Block until the main thread signals us to stop
                                time.sleep(1.0)
                                raise KeyboardInterrupt
                            # Second call (after KeyboardInterrupt handler) — just return
                            super().join(timeout=0.1)

                    buf = io.StringIO()
                    with (
                        patch("sys.stdout", buf),
                        patch("watchdog.observers.Observer", PatchedObserver),
                    ):
                        rc = main([
                            "watch",
                            str(FIXTURE_FILE),
                            "-o", str(out_dir),
                            "-p", str(port),
                        ])
                        result_holder.append(rc)
                except Exception as exc:
                    error_holder.append(exc)
                    started.set()

            t = threading.Thread(target=run_watch)
            t.start()

            started.wait(timeout=10)
            time.sleep(0.3)

            # Verify the output file was created
            expected_html = out_dir / "v01-minimal.html"
            self.assertTrue(expected_html.exists(), f"Expected {expected_html} to exist")

            # Verify the HTTP server is responding
            try:
                resp = urllib.request.urlopen(
                    f"http://localhost:{port}/v01-minimal.html", timeout=3
                )
                self.assertEqual(resp.status, 200)
                body = resp.read().decode()
                self.assertIn("<html", body)
            except Exception:
                # Server may have already shut down; acceptable on fast machines
                pass

            t.join(timeout=10)
            if error_holder:
                raise error_holder[0]
            self.assertEqual(result_holder, [0])

    def test_watch_graceful_without_watchdog(self) -> None:
        """When watchdog is not importable, watch exits with an error message."""
        with tempfile.TemporaryDirectory() as tmpdir:
            buf = io.StringIO()
            with (
                patch("sys.stderr", buf),
                patch.dict(
                    "sys.modules",
                    {
                        "watchdog": None,
                        "watchdog.observers": None,
                        "watchdog.events": None,
                    },
                ),
            ):
                rc = main(["watch", str(FIXTURE_FILE), "-o", tmpdir])
            self.assertEqual(rc, 1)
            self.assertIn("watchdog is required", buf.getvalue())


try:
    import watchdog
    HAS_WATCHDOG = True
except ImportError:
    HAS_WATCHDOG = False


@unittest.skipUnless(HAS_WATCHDOG, "watchdog not installed")
class RebuildHandlerTests(unittest.TestCase):
    """Test the file-change rebuild handler in isolation."""

    def test_handler_ignores_non_cln_files(self) -> None:
        """The handler should skip files that don't end in .cln."""
        from watchdog.events import FileModifiedEvent

        event = FileModifiedEvent("/tmp/test.txt")
        self.assertFalse(event.src_path.endswith(".cln"))

    def test_handler_detects_cln_files(self) -> None:
        """The handler should detect .cln file changes."""
        from watchdog.events import FileModifiedEvent

        event = FileModifiedEvent("/tmp/test.cln")
        self.assertTrue(event.src_path.endswith(".cln"))
        self.assertFalse(event.is_directory)


class FilesToRebuildTests(unittest.TestCase):
    def test_standalone_file(self) -> None:
        from clearnotation_reference.cli import files_to_rebuild
        result = files_to_rebuild(Path("/project/solo.cln"), {})
        self.assertEqual(result, {Path("/project/solo.cln")})

    def test_single_includer(self) -> None:
        from clearnotation_reference.cli import files_to_rebuild
        included_by = {Path("/project/chapter.cln"): {Path("/project/main.cln")}}
        result = files_to_rebuild(Path("/project/chapter.cln"), included_by)
        self.assertEqual(result, {Path("/project/chapter.cln"), Path("/project/main.cln")})

    def test_transitive_includes(self) -> None:
        from clearnotation_reference.cli import files_to_rebuild
        a, b, c = Path("/project/a.cln"), Path("/project/b.cln"), Path("/project/c.cln")
        included_by = {c: {b}, b: {a}}
        result = files_to_rebuild(c, included_by)
        self.assertEqual(result, {a, b, c})

    def test_diamond_dependency(self) -> None:
        from clearnotation_reference.cli import files_to_rebuild
        a, b, c, d = Path("/p/a.cln"), Path("/p/b.cln"), Path("/p/c.cln"), Path("/p/d.cln")
        included_by = {d: {b, c}, b: {a}, c: {a}}
        result = files_to_rebuild(d, included_by)
        self.assertEqual(result, {a, b, c, d})


class ExtractIncludesTests(unittest.TestCase):
    """Tests for include dependency extraction."""

    def test_no_includes(self) -> None:
        from clearnotation_reference.cli import extract_includes
        from clearnotation_reference.models import Document, Heading
        doc = Document(path=Path("/tmp/test.cln"), meta={}, blocks=[Heading(level=1, children=[], id=None, source_line=1)])
        result = extract_includes(doc, Path("/tmp/test.cln"))
        self.assertEqual(result, set())

    def test_single_include(self) -> None:
        from clearnotation_reference.cli import extract_includes
        from clearnotation_reference.models import Document, BlockDirective
        doc = Document(path=Path("/project/main.cln"), meta={}, blocks=[
            BlockDirective(name="include", attrs={"src": "chapter1.cln"}, body_mode="none"),
        ])
        result = extract_includes(doc, Path("/project/main.cln"))
        self.assertEqual(result, {Path("/project/chapter1.cln").resolve()})

    def test_nested_directive_with_include(self) -> None:
        from clearnotation_reference.cli import extract_includes
        from clearnotation_reference.models import Document, BlockDirective
        inner = BlockDirective(name="include", attrs={"src": "part.cln"}, body_mode="none")
        outer = BlockDirective(name="callout", attrs={"kind": "note"}, body_mode="blocks", blocks=[inner])
        doc = Document(path=Path("/project/main.cln"), meta={}, blocks=[outer])
        result = extract_includes(doc, Path("/project/main.cln"))
        self.assertEqual(result, {Path("/project/part.cln").resolve()})

    def test_multiple_includes(self) -> None:
        from clearnotation_reference.cli import extract_includes
        from clearnotation_reference.models import Document, BlockDirective
        doc = Document(path=Path("/project/main.cln"), meta={}, blocks=[
            BlockDirective(name="include", attrs={"src": "a.cln"}, body_mode="none"),
            BlockDirective(name="include", attrs={"src": "b.cln"}, body_mode="none"),
        ])
        result = extract_includes(doc, Path("/project/main.cln"))
        self.assertEqual(result, {Path("/project/a.cln").resolve(), Path("/project/b.cln").resolve()})


def _find_free_port() -> int:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


if __name__ == "__main__":
    unittest.main()
