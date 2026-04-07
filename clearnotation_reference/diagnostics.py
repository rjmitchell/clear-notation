"""Error formatting for ClearNotation compiler diagnostics."""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

from .errors import ClearNotationError


@dataclass
class SourcePosition:
    file: str
    line: int
    column: int = 0


@dataclass
class Diagnostic:
    severity: str
    code: str
    message: str
    position: SourcePosition | None = None
    suggestion: str | None = None

    @classmethod
    def from_error(cls, error: ClearNotationError, file: str = "<stdin>") -> Diagnostic:
        code = _error_code(error)
        pos = None
        if hasattr(error, "line") and error.line is not None:
            pos = SourcePosition(
                file=file,
                line=error.line,
                column=getattr(error, "column", 0),
            )
        return cls(
            severity="error",
            code=code,
            message=error.message,
            position=pos,
            suggestion=getattr(error, "suggestion", None),
        )


# Error code catalog (E0xx = parse, E1xx = validate)
_PARSE_CODES: dict[str, str] = {
    "missing_code_fence_language": "E001",
    "missing_required_marker_space": "E002",
    "meta_not_first": "E003",
    "unknown_block_directive": "E004",
    "unknown_inline_directive": "E005",
    "unclosed_inline_construct": "E006",
    "unclosed_block_directive": "E007",
    "invalid_escape_sequence": "E008",
    "invalid_link_target": "E009",
    "disallowed_inline_construct": "E010",
    "invalid_block_directive": "E011",
    "unexpected_directive_closer": "E012",
    "invalid_meta_block": "E013",
    "unexpected_document_state": "E014",
    "invalid_block": "E015",
}

_VALIDATE_CODES: dict[str, str] = {
    "unknown_attribute": "E101",
    "attribute_type_mismatch": "E102",
    "anchor_without_addressable_block": "E103",
    "unresolved_ref": "E104",
    "duplicate_id": "E105",
    "include_path_outside_root": "E106",
    "include_target_missing": "E107",
    "empty_generated_slug": "E108",
}


def _error_code(error: ClearNotationError) -> str:
    if error.phase == "parse":
        return _PARSE_CODES.get(error.kind, "E099")
    if error.phase == "validate":
        return _VALIDATE_CODES.get(error.kind, "E199")
    return "E999"


def format_human(
    diagnostic: Diagnostic,
    source_lines: list[str] | None = None,
    *,
    color: bool = True,
) -> str:
    parts: list[str] = []

    # Header
    code_str = f"[{diagnostic.code}]"
    header = f"error{code_str}: {diagnostic.message}"
    if color:
        header = f"\033[1;31merror{code_str}\033[0m: {diagnostic.message}"
    parts.append(header)

    # Location
    if diagnostic.position:
        pos = diagnostic.position
        loc = f"  --> {pos.file}:{pos.line}"
        if pos.column:
            loc += f":{pos.column}"
        parts.append(loc)

        # Source context
        if source_lines and 1 <= pos.line <= len(source_lines):
            line_text = source_lines[pos.line - 1]
            gutter = f"{pos.line:>4} | "
            parts.append(f"   |")
            parts.append(f"{gutter}{line_text}")
            parts.append(f"   |")

    # Suggestion
    if diagnostic.suggestion:
        parts.append(f"   = help: {diagnostic.suggestion}")

    return "\n".join(parts)


def format_plain(
    diagnostic: Diagnostic,
    source_lines: list[str] | None = None,
) -> str:
    return format_human(diagnostic, source_lines, color=False)


def format_json(diagnostic: Diagnostic) -> str:
    obj: dict[str, object] = {
        "severity": diagnostic.severity,
        "code": diagnostic.code,
        "message": diagnostic.message,
    }
    if diagnostic.position:
        obj["file"] = diagnostic.position.file
        obj["line"] = diagnostic.position.line
        obj["column"] = diagnostic.position.column
    if diagnostic.suggestion:
        obj["suggestion"] = diagnostic.suggestion
    return json.dumps(obj)


def format_diagnostic(
    diagnostic: Diagnostic,
    source_lines: list[str] | None = None,
    *,
    mode: str = "human",
) -> str:
    if mode == "json":
        return format_json(diagnostic)
    if mode == "plain":
        return format_plain(diagnostic, source_lines)
    color = hasattr(sys.stderr, "isatty") and sys.stderr.isatty()
    return format_human(diagnostic, source_lines, color=color)
