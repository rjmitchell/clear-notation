# Include-Aware File Watching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `cln watch` rebuild files that include a changed file, using a targeted dependency graph.

**Architecture:** Add `extract_includes` to scan parsed documents for `::include` directives. Maintain forward/reverse dependency maps in the watch handler. On file change, walk up the reverse map to find all files needing rebuild. Refresh the graph after each rebuild.

**Tech Stack:** Python, watchdog, unittest

---

### Task 1: Add `extract_includes` function and tests

**Files:**
- Modify: `clearnotation_reference/cli.py` (add function near `_parse_and_normalize`)
- Test: `tests/test_watch.py`

- [ ] **Step 1: Write tests for `extract_includes`**

Add this test class to `tests/test_watch.py`:

```python
class ExtractIncludesTests(unittest.TestCase):
    """Tests for include dependency extraction."""

    def test_no_includes(self) -> None:
        """A document with no includes returns empty set."""
        from clearnotation_reference.cli import extract_includes
        from clearnotation_reference.models import Document, Heading

        doc = Document(
            path=Path("/tmp/test.cln"),
            meta={},
            blocks=[Heading(level=1, children=[], id=None, source_line=1)],
        )
        result = extract_includes(doc, Path("/tmp/test.cln"))
        self.assertEqual(result, set())

    def test_single_include(self) -> None:
        """A document with one include returns the resolved path."""
        from clearnotation_reference.cli import extract_includes
        from clearnotation_reference.models import Document, BlockDirective

        doc = Document(
            path=Path("/project/main.cln"),
            meta={},
            blocks=[
                BlockDirective(
                    name="include",
                    attrs={"src": "chapter1.cln"},
                    body_mode="none",
                ),
            ],
        )
        result = extract_includes(doc, Path("/project/main.cln"))
        self.assertEqual(result, {Path("/project/chapter1.cln").resolve()})

    def test_nested_directive_with_include(self) -> None:
        """Includes inside callout blocks are found."""
        from clearnotation_reference.cli import extract_includes
        from clearnotation_reference.models import Document, BlockDirective

        inner = BlockDirective(
            name="include",
            attrs={"src": "part.cln"},
            body_mode="none",
        )
        outer = BlockDirective(
            name="callout",
            attrs={"kind": "note"},
            body_mode="blocks",
            blocks=[inner],
        )
        doc = Document(path=Path("/project/main.cln"), meta={}, blocks=[outer])
        result = extract_includes(doc, Path("/project/main.cln"))
        self.assertEqual(result, {Path("/project/part.cln").resolve()})

    def test_multiple_includes(self) -> None:
        """Multiple includes are all collected."""
        from clearnotation_reference.cli import extract_includes
        from clearnotation_reference.models import Document, BlockDirective

        doc = Document(
            path=Path("/project/main.cln"),
            meta={},
            blocks=[
                BlockDirective(name="include", attrs={"src": "a.cln"}, body_mode="none"),
                BlockDirective(name="include", attrs={"src": "b.cln"}, body_mode="none"),
            ],
        )
        result = extract_includes(doc, Path("/project/main.cln"))
        self.assertEqual(result, {
            Path("/project/a.cln").resolve(),
            Path("/project/b.cln").resolve(),
        })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_watch.py::ExtractIncludesTests -v 2>&1`
Expected: ImportError — `extract_includes` doesn't exist yet.

- [ ] **Step 3: Implement `extract_includes`**

In `clearnotation_reference/cli.py`, add these functions after the `_parse_and_normalize` function (around line 199):

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_watch.py::ExtractIncludesTests -v 2>&1`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add clearnotation_reference/cli.py tests/test_watch.py
git commit -m "feat: add extract_includes for dependency tracking"
```

---

### Task 2: Add `files_to_rebuild` function and tests

**Files:**
- Modify: `clearnotation_reference/cli.py`
- Test: `tests/test_watch.py`

- [ ] **Step 1: Write tests for `files_to_rebuild`**

Add this test class to `tests/test_watch.py`:

```python
class FilesToRebuildTests(unittest.TestCase):
    """Tests for the reverse-dependency rebuild walker."""

    def test_standalone_file(self) -> None:
        """A file with no includers returns only itself."""
        from clearnotation_reference.cli import files_to_rebuild

        included_by: dict[Path, set[Path]] = {}
        result = files_to_rebuild(Path("/project/solo.cln"), included_by)
        self.assertEqual(result, {Path("/project/solo.cln")})

    def test_single_includer(self) -> None:
        """A file included by one parent returns both."""
        from clearnotation_reference.cli import files_to_rebuild

        included_by = {
            Path("/project/chapter.cln"): {Path("/project/main.cln")},
        }
        result = files_to_rebuild(Path("/project/chapter.cln"), included_by)
        self.assertEqual(result, {
            Path("/project/chapter.cln"),
            Path("/project/main.cln"),
        })

    def test_transitive_includes(self) -> None:
        """A→B→C: changing C rebuilds B and A."""
        from clearnotation_reference.cli import files_to_rebuild

        a = Path("/project/a.cln")
        b = Path("/project/b.cln")
        c = Path("/project/c.cln")
        included_by = {
            c: {b},
            b: {a},
        }
        result = files_to_rebuild(c, included_by)
        self.assertEqual(result, {a, b, c})

    def test_diamond_dependency(self) -> None:
        """A includes B and C, both include D. Changing D rebuilds all four."""
        from clearnotation_reference.cli import files_to_rebuild

        a = Path("/p/a.cln")
        b = Path("/p/b.cln")
        c = Path("/p/c.cln")
        d = Path("/p/d.cln")
        included_by = {
            d: {b, c},
            b: {a},
            c: {a},
        }
        result = files_to_rebuild(d, included_by)
        self.assertEqual(result, {a, b, c, d})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_watch.py::FilesToRebuildTests -v 2>&1`
Expected: ImportError — `files_to_rebuild` doesn't exist yet.

- [ ] **Step 3: Implement `files_to_rebuild`**

In `clearnotation_reference/cli.py`, add after `_walk_includes`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_watch.py::FilesToRebuildTests -v 2>&1`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add clearnotation_reference/cli.py tests/test_watch.py
git commit -m "feat: add files_to_rebuild for transitive dependency walking"
```

---

### Task 3: Add `IncludeGraph` helper class and tests

**Files:**
- Modify: `clearnotation_reference/cli.py`
- Test: `tests/test_watch.py`

- [ ] **Step 1: Write tests for `IncludeGraph`**

Add this test class to `tests/test_watch.py`:

```python
class IncludeGraphTests(unittest.TestCase):
    """Tests for the include dependency graph."""

    def test_empty_graph(self) -> None:
        """A new graph has no dependencies."""
        from clearnotation_reference.cli import IncludeGraph

        graph = IncludeGraph()
        self.assertEqual(graph.files_to_rebuild(Path("/p/a.cln")), {Path("/p/a.cln")})

    def test_update_and_query(self) -> None:
        """After updating, the graph tracks dependencies."""
        from clearnotation_reference.cli import IncludeGraph

        graph = IncludeGraph()
        main = Path("/project/main.cln")
        chapter = Path("/project/chapter.cln")
        graph.update(main, {chapter})
        self.assertEqual(graph.files_to_rebuild(chapter), {main, chapter})

    def test_update_removes_stale_deps(self) -> None:
        """Updating a file replaces its old includes."""
        from clearnotation_reference.cli import IncludeGraph

        graph = IncludeGraph()
        main = Path("/project/main.cln")
        old = Path("/project/old.cln")
        new = Path("/project/new.cln")

        graph.update(main, {old})
        self.assertEqual(graph.files_to_rebuild(old), {main, old})

        graph.update(main, {new})
        # old is no longer included by main
        self.assertEqual(graph.files_to_rebuild(old), {old})
        self.assertEqual(graph.files_to_rebuild(new), {main, new})

    def test_transitive_rebuild(self) -> None:
        """A→B→C: changing C rebuilds all three."""
        from clearnotation_reference.cli import IncludeGraph

        graph = IncludeGraph()
        a = Path("/p/a.cln")
        b = Path("/p/b.cln")
        c = Path("/p/c.cln")
        graph.update(a, {b})
        graph.update(b, {c})
        self.assertEqual(graph.files_to_rebuild(c), {a, b, c})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_watch.py::IncludeGraphTests -v 2>&1`
Expected: ImportError — `IncludeGraph` doesn't exist yet.

- [ ] **Step 3: Implement `IncludeGraph`**

In `clearnotation_reference/cli.py`, add after `files_to_rebuild`:

```python
class IncludeGraph:
    """Tracks forward and reverse include dependencies for cln watch."""

    def __init__(self) -> None:
        self._includes: dict[Path, set[Path]] = {}
        self._included_by: dict[Path, set[Path]] = {}

    def update(self, source: Path, includes: set[Path]) -> None:
        """Replace the include set for *source*, updating the reverse map."""
        # Remove old reverse entries
        for old_target in self._includes.get(source, set()):
            refs = self._included_by.get(old_target)
            if refs is not None:
                refs.discard(source)
                if not refs:
                    del self._included_by[old_target]

        # Set new forward map
        if includes:
            self._includes[source] = set(includes)
        else:
            self._includes.pop(source, None)

        # Add new reverse entries
        for target in includes:
            self._included_by.setdefault(target, set()).add(source)

    def files_to_rebuild(self, changed: Path) -> set[Path]:
        """Return *changed* plus all transitive includers."""
        return files_to_rebuild(changed, self._included_by)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_watch.py::IncludeGraphTests -v 2>&1`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add clearnotation_reference/cli.py tests/test_watch.py
git commit -m "feat: add IncludeGraph class for watch dependency tracking"
```

---

### Task 4: Integrate dependency graph into `_cmd_watch`

**Files:**
- Modify: `clearnotation_reference/cli.py:184-198,335-417`

- [ ] **Step 1: Modify `_build_file` to optionally return the parsed document**

In `clearnotation_reference/cli.py`, change `_build_file` to accept an optional `return_doc` parameter and return the parsed `Document` alongside the exit code when requested. Replace the function (lines 207-238):

```python
def _build_file(
    input_path: Path,
    output_path: Path | None,
    config_path: str | None,
    fmt: str,
    *,
    return_doc: bool = False,
) -> int | tuple[int, "Document | None"]:
    doc = None
    try:
        ndoc, registry, doc = _parse_and_normalize(input_path, config_path)
    except MultipleValidationFailures as exc:
        source = input_path.read_text(encoding="utf-8")
        for err in exc.errors:
            _print_error(err, source, str(input_path), fmt)
        if return_doc:
            return 1, None
        return 1
    except ClearNotationError as exc:
        source = input_path.read_text(encoding="utf-8")
        _print_error(exc, source, str(input_path), fmt)
        if return_doc:
            return 1, None
        return 1

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

    if return_doc:
        return 0, doc
    return 0
```

- [ ] **Step 2: Build the dependency graph during initial build**

In `_cmd_watch` (line 357), replace the initial build section. After the initial build, walk all `.cln` files to populate the graph:

```python
    graph = IncludeGraph()

    # Initial build
    if input_path.is_dir():
        result = _build_directory(input_path, output, config_path, fmt)
        # Build dependency graph from all .cln files
        for cln_file in sorted(input_path.rglob("*.cln")):
            try:
                config, reg_data = load_config(cln_file, config_path)
                registry = Registry.from_toml(reg_data)
                source = cln_file.read_text(encoding="utf-8")
                doc = ReferenceParser(registry).parse_document(source, cln_file)
                graph.update(cln_file.resolve(), extract_includes(doc, cln_file))
            except Exception:
                pass  # Build errors already reported
    else:
        out_file = (out_dir / input_path.name).with_suffix(".html")
        build_result = _build_file(input_path, out_file, config_path, fmt, return_doc=True)
        assert isinstance(build_result, tuple)
        result, doc = build_result
        if doc is not None:
            graph.update(input_path.resolve(), extract_includes(doc, input_path))
```

- [ ] **Step 3: Update `_RebuildHandler` to use the dependency graph**

Replace the `_RebuildHandler` class in `_cmd_watch`:

```python
    class _RebuildHandler(FileSystemEventHandler):
        """Rebuild .cln files when they change on disk."""

        def on_modified(self, event):  # type: ignore[override]
            if event.is_directory:
                return
            if not event.src_path.endswith(".cln"):
                return
            changed = Path(event.src_path).resolve()
            to_rebuild = graph.files_to_rebuild(changed)
            for rebuild_path in to_rebuild:
                print(f"Changed: {rebuild_path}")
                try:
                    if input_path.is_dir():
                        rel = rebuild_path.relative_to(input_path.resolve())
                        dest = (out_dir / rel).with_suffix(".html")
                        dest.parent.mkdir(parents=True, exist_ok=True)
                    else:
                        dest = (out_dir / rebuild_path.name).with_suffix(".html")
                    build_result = _build_file(
                        rebuild_path, dest, config_path, fmt, return_doc=True,
                    )
                    assert isinstance(build_result, tuple)
                    rc, doc = build_result
                    if doc is not None:
                        graph.update(rebuild_path.resolve(), extract_includes(doc, rebuild_path))
                    print(f"Rebuilt {rebuild_path}")
                except Exception as exc:
                    print(f"Build error: {exc}", file=sys.stderr)
```

- [ ] **Step 4: Run existing watch tests to verify no regressions**

Run: `python3 -m pytest tests/test_watch.py -v 2>&1`
Expected: All existing tests pass, plus the 12 new tests from Tasks 1-3.

- [ ] **Step 5: Commit**

```bash
git add clearnotation_reference/cli.py
git commit -m "feat: integrate include dependency graph into cln watch"
```

---

### Task 5: Add integration test for include-aware watching

**Files:**
- Test: `tests/test_watch.py`

- [ ] **Step 1: Write integration test**

Add this test to the `WatchSubcommandTests` class in `tests/test_watch.py`:

```python
    def test_watch_rebuilds_includers_on_included_file_change(self) -> None:
        """When an included file changes, the including file is rebuilt."""
        with tempfile.TemporaryDirectory() as tmpdir:
            src_dir = Path(tmpdir) / "src"
            src_dir.mkdir()
            out_dir = Path(tmpdir) / "dist"

            # Create main.cln that includes part.cln
            part = src_dir / "part.cln"
            part.write_text("This is the included part.\n")
            main = src_dir / "main.cln"
            main.write_text(
                '= Main\n\n::include[src="part.cln"]\n'
            )

            # Build both files and populate graph
            from clearnotation_reference.cli import (
                IncludeGraph, extract_includes, _build_file,
            )
            from clearnotation_reference.parser import ReferenceParser
            from clearnotation_reference.config import load_config
            from clearnotation_reference.registry import Registry

            out_dir.mkdir()
            graph = IncludeGraph()

            for cln_file in sorted(src_dir.rglob("*.cln")):
                out_file = (out_dir / cln_file.relative_to(src_dir)).with_suffix(".html")
                build_result = _build_file(cln_file, out_file, None, "human", return_doc=True)
                assert isinstance(build_result, tuple)
                rc, doc = build_result
                if doc is not None:
                    graph.update(cln_file.resolve(), extract_includes(doc, cln_file))

            # Verify graph: part.cln is included by main.cln
            to_rebuild = graph.files_to_rebuild(part.resolve())
            self.assertIn(main.resolve(), to_rebuild)
            self.assertIn(part.resolve(), to_rebuild)

            # Record main.html mtime, then "change" part.cln
            main_html = out_dir / "main.html"
            self.assertTrue(main_html.exists())
            old_mtime = main_html.stat().st_mtime

            import time
            time.sleep(0.05)

            # Rebuild all files that the graph says need it
            for f in to_rebuild:
                rel = f.relative_to(src_dir.resolve())
                dest = (out_dir / rel).with_suffix(".html")
                _build_file(f, dest, None, "human")

            new_mtime = main_html.stat().st_mtime
            self.assertGreater(new_mtime, old_mtime)
```

- [ ] **Step 2: Run the test**

Run: `python3 -m pytest tests/test_watch.py::WatchSubcommandTests::test_watch_rebuilds_includers_on_included_file_change -v 2>&1`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/test_watch.py
git commit -m "test: add integration test for include-aware watch rebuilds"
```

---

### Task 6: Final verification and TODOS update

**Files:**
- Modify: `TODOS.md`

- [ ] **Step 1: Run full Python test suite**

Run: `cd /Users/ryan/projects/clear-notation && python3 -m unittest discover -s tests -v 2>&1 | tail -10`
Expected: All tests pass, including the new watch tests.

- [ ] **Step 2: Run JS and editor tests for baseline**

Run: `cd clearnotation-js && pnpm test 2>&1 | tail -3 && cd ../editor && pnpm test 2>&1 | tail -3`
Expected: No regressions (no Python changes affect these, but verify).

- [ ] **Step 3: Update TODOS.md**

Move "Include-aware file watching" from Open to Completed:

```markdown
### Include-aware file watching
- **Dependency graph:** `IncludeGraph` tracks forward/reverse include maps
- **Targeted rebuilds:** changing an included file rebuilds all transitive includers
- **Graph refresh:** dependencies update after each rebuild (handles added/removed includes)
- **Integration:** graph built during initial `cln watch` build, used by rebuild handler
```

- [ ] **Step 4: Commit**

```bash
git add TODOS.md
git commit -m "docs: update TODOS for include-aware file watching"
```
