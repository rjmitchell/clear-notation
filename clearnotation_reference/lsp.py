"""ClearNotation Language Server Protocol implementation using pygls."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

from pygls.server import LanguageServer
from pygls.lsp.types import (
    TEXT_DOCUMENT_COMPLETION,
    TEXT_DOCUMENT_DID_CHANGE,
    TEXT_DOCUMENT_DID_OPEN,
    TEXT_DOCUMENT_DID_SAVE,
    TEXT_DOCUMENT_FORMATTING,
    TEXT_DOCUMENT_HOVER,
    CompletionItem,
    CompletionItemKind,
    CompletionList,
    CompletionParams,
    Diagnostic,
    DiagnosticSeverity,
    DidChangeTextDocumentParams,
    DidOpenTextDocumentParams,
    DidSaveTextDocumentParams,
    DocumentFormattingParams,
    Hover,
    HoverParams,
    MarkupContent,
    MarkupKind,
    Position,
    Range,
    TextEdit,
)

from .config import load_config
from .diagnostics import Diagnostic as ClnDiagnostic
from .diagnostics import SourcePosition
from .errors import ClearNotationError
from .parser import ReferenceParser
from .registry import Registry
from .validator import ReferenceValidator

_DIRECTIVE_RE = re.compile(r"::([\w]+)")
_ATTR_OPEN_RE = re.compile(r"::\w+\s*\[")


class ClearNotationLanguageServer(LanguageServer):
    def __init__(self) -> None:
        super().__init__("clearnotation-lsp", "v0.1.0")
        self._config: dict[str, Any] = {"spec": "0.1"}
        self._registry: Registry | None = None
        self._reg_data: dict[str, Any] = {}

    def load_workspace_config(self) -> None:
        folders = self.workspace.folders
        if folders:
            root = Path(folders[list(folders.keys())[0]].uri.replace("file://", ""))
        else:
            root = Path.cwd()
        config, reg_data = load_config(root / "dummy.cln")
        self._config = config
        self._reg_data = reg_data
        self._registry = Registry.from_toml(reg_data)

    @property
    def registry(self) -> Registry:
        if self._registry is None:
            self.load_workspace_config()
        assert self._registry is not None
        return self._registry


server = ClearNotationLanguageServer()


@server.feature("initialized")
def on_initialized(params: Any) -> None:
    server.load_workspace_config()


@server.feature(TEXT_DOCUMENT_DID_OPEN)
def did_open(params: DidOpenTextDocumentParams) -> None:
    _validate_document(params.text_document.uri, params.text_document.text)


@server.feature(TEXT_DOCUMENT_DID_CHANGE)
def did_change(params: DidChangeTextDocumentParams) -> None:
    text = params.content_changes[-1].text if params.content_changes else ""
    _validate_document(params.text_document.uri, text)


@server.feature(TEXT_DOCUMENT_DID_SAVE)
def did_save(params: DidSaveTextDocumentParams) -> None:
    doc = server.workspace.get_text_document(params.text_document.uri)
    _validate_document(params.text_document.uri, doc.source)


def _validate_document(uri: str, source: str) -> None:
    diagnostics: list[Diagnostic] = []
    try:
        file_path = Path(uri.replace("file://", ""))
        parser = ReferenceParser(server.registry)
        doc = parser.parse_document(source, file_path)
        validator = ReferenceValidator(server.registry)
        validator.validate(doc, config=server._config)
    except ClearNotationError as exc:
        diag = ClnDiagnostic.from_error(exc, file=uri)
        line = (diag.position.line - 1) if diag.position and diag.position.line else 0
        col = diag.position.column if diag.position and diag.position.column else 0
        diagnostics.append(
            Diagnostic(
                range=Range(
                    start=Position(line=line, character=col),
                    end=Position(line=line, character=col + 1),
                ),
                message=diag.message,
                severity=DiagnosticSeverity.Error,
                source="clearnotation",
                code=diag.code,
            )
        )
    server.publish_diagnostics(uri, diagnostics)


@server.feature(TEXT_DOCUMENT_COMPLETION)
def completions(params: CompletionParams) -> CompletionList:
    doc = server.workspace.get_text_document(params.text_document.uri)
    line_text = _get_line(doc.source, params.position.line)
    col = params.position.character
    prefix = line_text[:col]

    items: list[CompletionItem] = []

    # Case 1: After :: → directive names
    if prefix.rstrip().endswith("::") or re.search(r"::\w*$", prefix):
        # Provide all directive names from the registry
        for directive in server._reg_data.get("directive", []):
            name = directive["name"]
            placement = directive["placement"]
            items.append(
                CompletionItem(
                    label=name,
                    kind=CompletionItemKind.Keyword,
                    detail=f"{placement} directive",
                    insert_text=name,
                )
            )

    # Case 2: Inside [ after directive → attribute names
    elif "[" in prefix and "::" in prefix:
        m = _DIRECTIVE_RE.search(prefix)
        if m:
            directive_name = m.group(1)
            reg = server.registry
            spec = reg.any(directive_name)
            if spec:
                for attr_name, attr_spec in spec.attributes.items():
                    detail = f"{attr_spec.type_name}"
                    if attr_spec.required:
                        detail += " (required)"
                    items.append(
                        CompletionItem(
                            label=attr_name,
                            kind=CompletionItemKind.Property,
                            detail=detail,
                            insert_text=f'{attr_name}="$1"',
                        )
                    )

    # Case 3: After = inside attribute → allowed_values
    elif re.search(r'=\s*"?\w*$', prefix) and "::" in prefix:
        m = _DIRECTIVE_RE.search(prefix)
        attr_m = re.search(r'(\w+)\s*=\s*"?\w*$', prefix)
        if m and attr_m:
            directive_name = m.group(1)
            attr_name = attr_m.group(1)
            reg = server.registry
            spec = reg.any(directive_name)
            if spec and attr_name in spec.attributes:
                attr_spec = spec.attributes[attr_name]
                for val in attr_spec.allowed_values:
                    items.append(
                        CompletionItem(
                            label=val,
                            kind=CompletionItemKind.EnumMember,
                            detail=f"allowed value for {attr_name}",
                        )
                    )

    return CompletionList(is_incomplete=False, items=items)


@server.feature(TEXT_DOCUMENT_HOVER)
def hover(params: HoverParams) -> Hover | None:
    doc = server.workspace.get_text_document(params.text_document.uri)
    line_text = _get_line(doc.source, params.position.line)
    col = params.position.character

    # Find directive name at cursor position
    for m in _DIRECTIVE_RE.finditer(line_text):
        if m.start() <= col <= m.end():
            name = m.group(1)
            spec = server.registry.any(name)
            if spec:
                lines = [f"**::{name}** ({spec.placement} directive)"]
                lines.append(f"- body: `{spec.body_mode}`")
                if spec.attributes:
                    lines.append("- attributes:")
                    for attr_name, attr_spec in spec.attributes.items():
                        req = " (required)" if attr_spec.required else ""
                        line = f"  - `{attr_name}`: {attr_spec.type_name}{req}"
                        if attr_spec.allowed_values:
                            line += f" [{', '.join(attr_spec.allowed_values)}]"
                        if attr_spec.default is not None:
                            line += f" = {attr_spec.default}"
                        lines.append(line)
                return Hover(
                    contents=MarkupContent(
                        kind=MarkupKind.Markdown,
                        value="\n".join(lines),
                    )
                )
    return None


@server.feature(TEXT_DOCUMENT_FORMATTING)
def formatting(params: DocumentFormattingParams) -> list[TextEdit] | None:
    doc = server.workspace.get_text_document(params.text_document.uri)
    source = doc.source
    try:
        from .formatter import Formatter

        formatter = Formatter(server.registry)
        formatted = formatter.format(source)
        if formatted == source:
            return None
        # Replace entire document
        lines = source.splitlines()
        return [
            TextEdit(
                range=Range(
                    start=Position(line=0, character=0),
                    end=Position(line=len(lines), character=0),
                ),
                new_text=formatted,
            )
        ]
    except Exception:
        return None


def _get_line(source: str, line: int) -> str:
    lines = source.splitlines()
    if 0 <= line < len(lines):
        return lines[line]
    return ""


def main() -> None:
    server.start_io()


if __name__ == "__main__":
    main()
