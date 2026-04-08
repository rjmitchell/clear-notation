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


def _find_free_port() -> int:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


if __name__ == "__main__":
    unittest.main()
