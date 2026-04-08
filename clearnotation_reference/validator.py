"""Validation for parsed ClearNotation documents."""

from __future__ import annotations

from pathlib import Path
import re
import unicodedata
from typing import Any, cast

from .errors import DiagnosticCollection, ValidationFailure

from .inline_parser import InlineParser
from .models import (
    BlockDirective,
    BlockNode,
    BlockQuote,
    CodeSpan,
    Comment,
    Document,
    Emphasis,
    Heading,
    InlineDirective,
    InlineNode,
    Link,
    Note,
    OrderedList,
    Paragraph,
    SourceBlock,
    Strong,
    Text,
    ThematicBreak,
    UnorderedList,
)
from .registry import DirectiveSpec, Registry


class ReferenceValidator:
    def __init__(self, registry: Registry) -> None:
        self.registry = registry
        self.ids: dict[str, BlockNode] = {}
        self.refs: list[str] = []
        self.note_counter = 1
        self.diagnostics = DiagnosticCollection()

    def validate(self, document: Document, *, config: dict[str, Any]) -> None:
        config_base = self._discover_config_base(document.path)
        project_root = self._resolve_project_root(config_base, config)
        include_roots = self._resolve_include_roots(config_base, config, project_root)
        pending_anchor: str | None = None
        slug_counts: dict[str, int] = {}
        pending_anchor = self._validate_blocks(
            document.blocks,
            document_path=document.path,
            project_root=project_root,
            include_roots=include_roots,
            pending_anchor=pending_anchor,
            slug_counts=slug_counts,
        )
        if pending_anchor is not None:
            self.diagnostics.add(ValidationFailure(
                "anchor_without_addressable_block",
                "An anchor must be followed by an addressable block",
            ))
        for target in self.refs:
            if target not in self.ids:
                self.diagnostics.add(ValidationFailure("unresolved_ref", f"Unresolved ref target: {target}"))
        self.diagnostics.raise_if_errors()

    def _validate_blocks(
        self,
        blocks: list[BlockNode],
        *,
        document_path: Path,
        project_root: Path,
        include_roots: tuple[Path, ...],
        pending_anchor: str | None,
        slug_counts: dict[str, int],
    ) -> str | None:
        for block in blocks:
            if isinstance(block, Comment):
                continue
            try:
                if isinstance(block, Heading):
                    pending_anchor = self._assign_heading_id(block, pending_anchor, slug_counts)
                    self._visit_inlines(block.children)
                    continue
                if isinstance(block, Paragraph):
                    pending_anchor = self._assign_optional_id(block, pending_anchor)
                    self._visit_inlines(block.children)
                    continue
                if isinstance(block, BlockQuote):
                    pending_anchor = self._assign_optional_id(block, pending_anchor)
                    for line in block.lines:
                        self._visit_inlines(line)
                    continue
                if isinstance(block, UnorderedList):
                    pending_anchor = self._assign_optional_id(block, pending_anchor)
                    for item in block.items:
                        self._visit_inlines(item)
                    continue
                if isinstance(block, OrderedList):
                    pending_anchor = self._assign_optional_id(block, pending_anchor)
                    for item in block.items:
                        self._visit_inlines(item.children)
                    continue
                if isinstance(block, SourceBlock):
                    pending_anchor = self._assign_optional_id(block, pending_anchor)
                    continue
                if isinstance(block, ThematicBreak):
                    continue
                if isinstance(block, BlockDirective):
                    pending_anchor = self._validate_directive(
                        block,
                        document_path=document_path,
                        project_root=project_root,
                        include_roots=include_roots,
                        pending_anchor=pending_anchor,
                        slug_counts=slug_counts,
                    )
            except ValidationFailure as exc:
                self.diagnostics.add(exc)
                # Reset pending_anchor: the erroring block consumed it
                pending_anchor = None
        return pending_anchor

    def _validate_directive(
        self,
        block: BlockDirective,
        *,
        document_path: Path,
        project_root: Path,
        include_roots: tuple[Path, ...],
        pending_anchor: str | None,
        slug_counts: dict[str, int],
    ) -> str | None:
        _line = block.source_line
        spec = self.registry.block(block.name)
        if spec is None:
            raise ValidationFailure("unknown_block_directive", f"Unknown directive {block.name}", line=_line)
        attrs = self._validate_attrs(spec, block.attrs, line=_line)
        block.attrs = attrs

        if block.name == "anchor":
            anchor_id = cast(str, attrs.get("id"))
            if anchor_id is None:
                raise ValidationFailure("attribute_type_mismatch", "anchor.id is required", line=_line)
            return anchor_id
        if block.name == "include":
            self._validate_include(cast(str, attrs.get("src")), document_path, project_root, include_roots, line=_line)
            return pending_anchor
        if block.name == "toc":
            return self._assign_optional_id(block, pending_anchor)
        if block.name in {"callout", "figure"}:
            pending_anchor = self._assign_optional_id(block, pending_anchor)
            leftover = self._validate_blocks(
                block.blocks,
                document_path=document_path,
                project_root=project_root,
                include_roots=include_roots,
                pending_anchor=None,
                slug_counts=slug_counts,
            )
            if leftover is not None:
                raise ValidationFailure(
                    "anchor_without_addressable_block",
                    "An anchor inside a parsed directive must target an addressable block",
                )
            return pending_anchor
        if block.name == "math":
            return self._assign_optional_id(block, pending_anchor)
        if block.name == "table":
            pending_anchor = self._assign_optional_id(block, pending_anchor)
            self._validate_table(block)
            return pending_anchor
        if block.name == "source":
            return self._assign_optional_id(block, pending_anchor)
        return pending_anchor

    def _validate_attrs(self, spec: DirectiveSpec, raw_attrs: dict[str, Any], *, line: int | None = None) -> dict[str, Any]:
        attrs = dict(raw_attrs)
        for key in attrs:
            if key not in spec.attributes:
                raise ValidationFailure("unknown_attribute", f"Unknown attribute {key} on {spec.name}", line=line)
        normalized: dict[str, Any] = {}
        for name, attr_spec in spec.attributes.items():
            if name not in attrs:
                if attr_spec.required:
                    raise ValidationFailure(
                        "attribute_type_mismatch",
                        f"Missing required attribute {name} on {spec.name}",
                        line=line,
                    )
                if attr_spec.default is not None:
                    normalized[name] = attr_spec.default
                continue
            value = attrs[name]
            if not self._matches_type(value, attr_spec.type_name):
                raise ValidationFailure(
                    "attribute_type_mismatch",
                    f"Attribute {name} on {spec.name} must be {attr_spec.type_name}",
                    line=line,
                )
            if attr_spec.allowed_values:
                values = value if isinstance(value, list) else [value]
                for item in values:
                    if item not in attr_spec.allowed_values:
                        raise ValidationFailure(
                            "attribute_type_mismatch",
                            f"Attribute {name} on {spec.name} contains unsupported value {item!r}",
                            line=line,
                        )
            normalized[name] = value
        return normalized

    def _validate_include(
        self,
        src: str,
        document_path: Path,
        project_root: Path,
        include_roots: tuple[Path, ...],
        *,
        line: int | None = None,
    ) -> None:
        if src is None:
            raise ValidationFailure("attribute_type_mismatch", "include.src is required", line=line)
        if Path(src).is_absolute() or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", src):
            raise ValidationFailure("include_path_outside_root", "Include paths must be relative project paths", line=line)
        target = (document_path.parent / src).resolve()
        if not self._is_within(target, project_root):
            raise ValidationFailure("include_path_outside_root", "Include target escapes the project root", line=line)
        if include_roots and not any(self._is_within(target, root) for root in include_roots):
            raise ValidationFailure("include_path_outside_root", "Include target is outside allowed include roots", line=line)
        if not target.exists() or not target.is_file():
            raise ValidationFailure("include_target_missing", f"Include target does not exist: {src}", line=line)

    def _validate_table(self, block: BlockDirective) -> None:
        _line = block.source_line
        rows = [self._split_table_row(line) for line in block.raw_text.splitlines() if line]
        if not rows:
            return
        column_count = len(rows[0])
        for row in rows[1:]:
            if len(row) != column_count:
                raise ValidationFailure("attribute_type_mismatch", "All table rows must have the same cell count", line=_line)
        align = block.attrs.get("align")
        if align is not None and len(cast(list[Any], align)) != column_count:
            raise ValidationFailure("attribute_type_mismatch", "table.align length must match the column count", line=_line)
        for row in rows:
            for cell in row:
                self._visit_inlines(InlineParser(cell, self.registry, line=_line).parse())

    def _split_table_row(self, line: str) -> list[str]:
        cells: list[str] = []
        current: list[str] = []
        index = 0
        while index < len(line):
            ch = line[index]
            if ch == "\\":
                index += 1
                if index >= len(line):
                    raise ValidationFailure("attribute_type_mismatch", "Dangling escape in table cell")
                escaped = line[index]
                if escaped not in {"|", "\\"}:
                    raise ValidationFailure("attribute_type_mismatch", f"Unsupported table escape \\{escaped}")
                current.append(escaped)
                index += 1
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

    def _visit_inlines(self, inlines: list[InlineNode]) -> None:
        for node in inlines:
            if isinstance(node, (Text, CodeSpan)):
                continue
            if isinstance(node, (Strong, Emphasis)):
                self._visit_inlines(node.children)
                continue
            if isinstance(node, Link):
                self._visit_inlines(node.label)
                continue
            if isinstance(node, Note):
                node.number = self.note_counter
                self.note_counter += 1
                self._visit_inlines(node.children)
                continue
            if isinstance(node, InlineDirective):
                spec = self.registry.inline(node.name)
                if spec is None:
                    raise ValidationFailure("unknown_attribute", f"Unknown inline directive {node.name}")
                node.attrs = self._validate_attrs(spec, node.attrs)
                if node.name == "ref":
                    target = cast(str | None, node.attrs.get("target"))
                    if target is None:
                        raise ValidationFailure("attribute_type_mismatch", "ref.target is required")
                    self.refs.append(target)

    def _assign_heading_id(
        self,
        block: Heading,
        pending_anchor: str | None,
        slug_counts: dict[str, int],
    ) -> None:
        if pending_anchor is not None:
            self._register_id(block, pending_anchor)
            return None
        base = self._slugify(self._plain_text(block.children, include_notes=False))
        if not base:
            raise ValidationFailure("empty_generated_slug", "Heading slug is empty", line=block.source_line)
        count = slug_counts.get(base, 0) + 1
        slug_counts[base] = count
        slug = base if count == 1 else f"{base}-{count}"
        self._register_id(block, slug)
        return None

    def _assign_optional_id(self, block: Any, pending_anchor: str | None) -> None:
        if pending_anchor is None:
            return None
        self._register_id(block, pending_anchor)
        return None

    def _register_id(self, block: Any, block_id: str) -> None:
        if block_id in self.ids:
            raise ValidationFailure("duplicate_id", f"Duplicate id: {block_id}", line=getattr(block, "source_line", None))
        block.id = block_id
        self.ids[block_id] = block

    def _plain_text(self, inlines: list[InlineNode], *, include_notes: bool) -> str:
        parts: list[str] = []
        for node in inlines:
            if isinstance(node, Text):
                parts.append(node.value)
            elif isinstance(node, CodeSpan):
                parts.append(node.value)
            elif isinstance(node, (Strong, Emphasis)):
                parts.append(self._plain_text(node.children, include_notes=include_notes))
            elif isinstance(node, Link):
                parts.append(self._plain_text(node.label, include_notes=include_notes))
            elif isinstance(node, Note):
                if include_notes:
                    parts.append(self._plain_text(node.children, include_notes=include_notes))
            elif isinstance(node, InlineDirective):
                continue
        return "".join(parts)

    def _slugify(self, text: str) -> str:
        normalized = unicodedata.normalize("NFKD", text).lower()
        chars: list[str] = []
        last_dash = False
        for ch in normalized:
            if ch.isascii() and ch.isalnum():
                chars.append(ch)
                last_dash = False
                continue
            if not last_dash:
                chars.append("-")
                last_dash = True
        return "".join(chars).strip("-")

    def _matches_type(self, value: Any, type_name: str) -> bool:
        if type_name == "string":
            return isinstance(value, str)
        if type_name == "boolean":
            return isinstance(value, bool)
        if type_name == "integer":
            return isinstance(value, int) and not isinstance(value, bool)
        if type_name == "string[]":
            return isinstance(value, list) and all(isinstance(item, str) for item in value)
        if type_name == "boolean[]":
            return isinstance(value, list) and all(isinstance(item, bool) for item in value)
        if type_name == "integer[]":
            return isinstance(value, list) and all(
                isinstance(item, int) and not isinstance(item, bool) for item in value
            )
        return False

    def _discover_config_base(self, document_path: Path) -> Path:
        for parent in (document_path.parent, *document_path.parents):
            if (parent / "clearnotation.toml").exists():
                return parent
        return Path.cwd()

    def _resolve_project_root(self, config_base: Path, config: dict[str, Any]) -> Path:
        project = cast(dict[str, Any], config.get("project", {}))
        root_value = project.get("root", ".")
        root_path = Path(root_value)
        if root_path.is_absolute():
            return root_path.resolve()
        return (config_base / root_path).resolve()

    def _resolve_include_roots(
        self,
        config_base: Path,
        config: dict[str, Any],
        project_root: Path,
    ) -> tuple[Path, ...]:
        includes = cast(dict[str, Any], config.get("includes", {}))
        roots = includes.get("roots", [str(project_root)])
        resolved: list[Path] = []
        for raw_root in roots:
            root_path = Path(raw_root)
            resolved.append(root_path.resolve() if root_path.is_absolute() else (config_base / root_path).resolve())
        return tuple(resolved)

    def _is_within(self, child: Path, parent: Path) -> bool:
        try:
            child.relative_to(parent)
        except ValueError:
            return False
        return True
