"""Shared parsing utilities for ClearNotation."""

from __future__ import annotations


def split_table_row(line: str) -> list[str]:
    """Split a pipe-delimited table row into cell strings.

    Handles ``\\|`` and ``\\\\`` escapes. Unknown escape sequences
    are kept as-is (backslash preserved).
    """
    cells: list[str] = []
    current: list[str] = []
    index = 0
    while index < len(line):
        ch = line[index]
        if ch == "\\":
            index += 1
            if index < len(line) and line[index] in {"|", "\\"}:
                current.append(line[index])
                index += 1
                continue
            current.append("\\")
            continue
        if ch == "|":
            cells.append("".join(current).strip())
            current.clear()
            index += 1
            continue
        current.append(ch)
        index += 1
    cells.append("".join(current).strip())
    return cells
