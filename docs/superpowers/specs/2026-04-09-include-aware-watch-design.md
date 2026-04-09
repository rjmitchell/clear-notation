# Include-Aware File Watching — Design Spec

**Date:** 2026-04-09
**Scope:** Make `cln watch` rebuild files that include a changed file, not just the changed file itself.

## Problem

`cln watch` rebuilds only the directly-modified `.cln` file. If `main.cln` includes `chapter1.cln` via `::include[src="chapter1.cln"]` and you edit `chapter1.cln`, only `chapter1.cln` gets rebuilt — `main.cln` is not touched, so its HTML is stale.

## Design

### Include extraction

Add a function `extract_includes(doc: Document, source_path: Path) -> set[Path]` that walks the parsed document's block tree and returns resolved absolute paths for every `::include` directive found. This avoids coupling to the normalizer — it operates on the parsed tree before normalization.

```python
def extract_includes(doc: Document, source_path: Path) -> set[Path]:
    """Extract resolved include paths from a parsed document."""
    result: set[Path] = set()
    _walk_blocks(doc.blocks, source_path, result)
    return result

def _walk_blocks(blocks: list[BlockNode], source_path: Path, result: set[Path]) -> None:
    for block in blocks:
        if isinstance(block, BlockDirective):
            if block.name == "include":
                src = block.attrs.get("src")
                if src:
                    target = (source_path.parent / src).resolve()
                    result.add(target)
            # Recurse into directive children (callouts, figures, etc.)
            _walk_blocks(block.blocks, source_path, result)
```

### Dependency graph

Two dicts maintained in the watch handler:

```python
# Forward: file → set of files it includes
includes: dict[Path, set[Path]]

# Reverse: file → set of files that include it
included_by: dict[Path, set[Path]]
```

Built during the initial build by calling `extract_includes` on each file's parsed document. Updated after each rebuild.

### Rebuild logic

When a `.cln` file changes:

```python
def files_to_rebuild(changed: Path, included_by: dict[Path, set[Path]]) -> set[Path]:
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

After rebuilding each file, re-extract its includes and update the graph. This handles cases where an include directive was added or removed.

### Integration with `_cmd_watch`

Modify `_cmd_watch` in `cli.py`:

1. During the initial build, collect the dependency graph by parsing each file and calling `extract_includes`
2. Store the graph on the `_RebuildHandler` instance
3. In `on_modified`, call `files_to_rebuild` to get the full set, then rebuild each
4. After each rebuild, update the graph for that file

The initial build already calls `_parse_and_normalize` which parses the document. To avoid parsing twice, modify `_build_file` to optionally return the parsed `Document` so the watch handler can extract includes from it.

### Files touched

- `clearnotation_reference/cli.py` — watch handler changes, graph management
- `tests/test_watch.py` — new tests for include-aware rebuilds

### Testing

1. **Basic include rebuild:** Create `main.cln` that includes `part.cln`. Modify `part.cln`. Assert `main.cln` is rebuilt.
2. **Transitive rebuild:** A includes B includes C. Modify C. Assert both A and B are rebuilt.
3. **Graph update:** Start with `main.cln` including `part.cln`. Edit `main.cln` to remove the include. Modify `part.cln`. Assert `main.cln` is NOT rebuilt.
4. **Non-included file:** Modify a standalone file. Assert only that file is rebuilt (no graph overhead for simple cases).
