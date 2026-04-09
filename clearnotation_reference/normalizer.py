"""Normalizer: converts a validated parsed tree into the renderer-facing normalized AST."""

from __future__ import annotations

import unicodedata
from pathlib import Path
from typing import Any, cast

from .errors import ValidationFailure
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
    ListItem,
    NBlockQuote,
    NCallout,
    NExtensionBlock,
    NFigure,
    NHeading,
    NListItem,
    NMathBlock,
    NOrderedItem,
    NOrderedList,
    NParagraph,
    NRef,
    NSourceBlock,
    NTable,
    NTableCell,
    NTableRow,
    NThematicBreak,
    NToc,
    NUnorderedList,
    NormalizedBlock,
    NormalizedDocument,
    NormalizedInline,
    Note,
    OrderedList,
    Paragraph,
    SourceBlock,
    Strong,
    Text,
    ThematicBreak,
    UnorderedList,
)
from .registry import Registry
from .utils import split_table_row


class Normalizer:
    def __init__(self, registry: Registry) -> None:
        self.registry = registry
        self.note_counter = 1
        self.notes: list[Note] = []
        self.slug_counts: dict[str, int] = {}
        self._source_path: Path | None = None
        self._config: dict[str, Any] | None = None
        self._include_stack: frozenset[Path] = frozenset()
        self._include_depth: int = 0

    def normalize(
        self,
        document: Document,
        *,
        source_path: Path | None = None,
        config: dict[str, Any] | None = None,
        _include_stack: frozenset[Path] | None = None,
        _include_depth: int = 0,
    ) -> NormalizedDocument:
        self._source_path = source_path or document.path
        self._config = config
        self._include_stack = _include_stack if _include_stack is not None else frozenset()
        self._include_depth = _include_depth
        blocks = self._normalize_blocks(document.blocks, pending_anchor=None)
        return NormalizedDocument(
            meta=dict(document.meta),
            blocks=blocks,
            notes=list(self.notes),
        )

    def _normalize_blocks(
        self,
        blocks: list[BlockNode],
        pending_anchor: str | None,
    ) -> list[NormalizedBlock]:
        result: list[NormalizedBlock] = []
        for block in blocks:
            if isinstance(block, Comment):
                continue

            if isinstance(block, Heading):
                heading_id, pending_anchor = self._heading_id(block, pending_anchor)
                result.append(NHeading(
                    level=block.level,
                    id=heading_id,
                    content=self._normalize_inlines(block.children),
                ))
                continue

            if isinstance(block, Paragraph):
                block_id, pending_anchor = self._consume_anchor(pending_anchor)
                result.append(NParagraph(
                    content=self._normalize_inlines(block.children),
                    id=block_id,
                ))
                continue

            if isinstance(block, ThematicBreak):
                result.append(NThematicBreak())
                continue

            if isinstance(block, BlockQuote):
                block_id, pending_anchor = self._consume_anchor(pending_anchor)
                result.append(NBlockQuote(
                    lines=[self._normalize_inlines(line) for line in block.lines],
                    id=block_id,
                ))
                continue

            if isinstance(block, UnorderedList):
                block_id, pending_anchor = self._consume_anchor(pending_anchor)
                result.append(NUnorderedList(
                    items=[
                        NListItem(
                            content=self._normalize_inlines(item.children),
                            blocks=self._normalize_blocks(item.blocks, pending_anchor=None),
                        )
                        for item in block.items
                    ],
                    id=block_id,
                ))
                continue

            if isinstance(block, OrderedList):
                block_id, pending_anchor = self._consume_anchor(pending_anchor)
                result.append(NOrderedList(
                    items=[
                        NOrderedItem(
                            ordinal=item.ordinal,
                            content=self._normalize_inlines(item.children),
                            blocks=self._normalize_blocks(item.blocks, pending_anchor=None),
                        )
                        for item in block.items
                    ],
                    id=block_id,
                ))
                continue

            if isinstance(block, SourceBlock):
                block_id, pending_anchor = self._consume_anchor(pending_anchor)
                result.append(NSourceBlock(
                    language=block.language,
                    text=block.text,
                    id=block_id,
                ))
                continue

            if isinstance(block, BlockDirective):
                if block.name == "include" and self._source_path is not None and self._config is not None:
                    inlined, pending_anchor = self._inline_include(
                        block, pending_anchor,
                    )
                    result.extend(inlined)
                    continue
                normalized, pending_anchor = self._normalize_directive(
                    block, pending_anchor,
                )
                if normalized is not None:
                    result.append(normalized)
                continue

        return result

    def _normalize_directive(
        self,
        block: BlockDirective,
        pending_anchor: str | None,
    ) -> tuple[NormalizedBlock | None, str | None]:
        if block.name == "anchor":
            anchor_id = cast(str, block.attrs.get("id"))
            return None, anchor_id

        if block.name == "include":
            # When source_path/config are available, inlining is handled in
            # _normalize_blocks via _inline_include.  This fallback keeps the
            # v0.1 behaviour for callers that don't provide those arguments.
            return None, pending_anchor

        if block.name == "toc":
            block_id, pending_anchor = self._consume_anchor(pending_anchor)
            return NToc(id=block_id), pending_anchor

        if block.name == "callout":
            block_id, pending_anchor = self._consume_anchor(pending_anchor)
            return NCallout(
                kind=cast(str, block.attrs.get("kind", "")),
                title=block.attrs.get("title"),
                compact=bool(block.attrs.get("compact", False)),
                blocks=self._normalize_blocks(block.blocks, pending_anchor=None),
                id=block_id,
            ), pending_anchor

        if block.name == "figure":
            block_id, pending_anchor = self._consume_anchor(pending_anchor)
            return NFigure(
                src=cast(str, block.attrs.get("src", "")),
                blocks=self._normalize_blocks(block.blocks, pending_anchor=None),
                id=block_id,
            ), pending_anchor

        if block.name == "math":
            block_id, pending_anchor = self._consume_anchor(pending_anchor)
            return NMathBlock(
                text=block.raw_text,
                id=block_id,
            ), pending_anchor

        if block.name == "table":
            block_id, pending_anchor = self._consume_anchor(pending_anchor)
            return self._normalize_table(block, block_id), pending_anchor

        if block.name == "source":
            block_id, pending_anchor = self._consume_anchor(pending_anchor)
            return NSourceBlock(
                language=cast(str, block.attrs.get("language", "")),
                text=block.raw_text,
                id=block_id,
            ), pending_anchor

        # Unknown extension directive: wrap as NExtensionBlock
        block_id, pending_anchor = self._consume_anchor(pending_anchor)
        return NExtensionBlock(
            type_name=block.name,
            data=dict(block.attrs),
            blocks=self._normalize_blocks(block.blocks, pending_anchor=None),
            id=block_id,
        ), pending_anchor

    def _inline_include(
        self,
        block: BlockDirective,
        pending_anchor: str | None,
    ) -> tuple[list[NormalizedBlock], str | None]:
        """Resolve an ``::include`` directive by recursively normalizing the target."""
        from .parser import ReferenceParser
        from .validator import ReferenceValidator
        from .config import load_config

        src = cast(str, block.attrs.get("src"))
        assert self._source_path is not None
        target = (self._source_path.parent / src).resolve()

        # Circular detection: check if target is already in the include chain
        if target in self._include_stack:
            chain = " -> ".join(str(p.name) for p in self._include_stack)
            raise ValidationFailure(
                "circular_include",
                f"Circular include detected: {chain} -> {target.name}",
                line=block.source_line,
            )

        # Depth check
        if self._include_depth >= 10:
            raise ValidationFailure(
                "include_depth_exceeded",
                f"Include depth exceeds maximum of 10 levels",
                line=block.source_line,
            )

        # Read, parse, validate the target file
        source_text = target.read_text(encoding="utf-8")
        parser = ReferenceParser(self.registry)
        doc = parser.parse_document(source_text, target)

        config, _ = load_config(target)
        validator = ReferenceValidator(self.registry)
        validator.validate(doc, config=config)

        # Normalize recursively with shared slug/note state
        child = Normalizer(self.registry)
        child.slug_counts = self.slug_counts
        child.note_counter = self.note_counter
        child_doc = child.normalize(
            doc,
            source_path=target,
            config=self._config,
            _include_stack=self._include_stack | {target},
            _include_depth=self._include_depth + 1,
        )

        # Absorb shared state back
        self.note_counter = child.note_counter
        self.notes.extend(child_doc.notes)

        return child_doc.blocks, pending_anchor

    def _normalize_table(
        self,
        block: BlockDirective,
        block_id: str | None,
    ) -> NTable:
        raw_rows = [
            split_table_row(line)
            for line in block.raw_text.splitlines()
            if line.strip()
        ]
        rows: list[NTableRow] = []
        for raw_row in raw_rows:
            cells: list[NTableCell] = []
            for cell_text in raw_row:
                parsed = InlineParser(cell_text, self.registry, line=block.source_line).parse()
                cells.append(NTableCell(content=self._normalize_inlines(parsed)))
            rows.append(NTableRow(cells=cells))

        return NTable(
            header=bool(block.attrs.get("header", False)),
            align=block.attrs.get("align"),
            rows=rows,
            id=block_id,
        )

    def _normalize_inlines(self, inlines: list[InlineNode]) -> list[NormalizedInline]:
        result: list[NormalizedInline] = []
        for node in inlines:
            if isinstance(node, Text):
                result.append(node)
                continue
            if isinstance(node, CodeSpan):
                result.append(node)
                continue
            if isinstance(node, Strong):
                result.append(Strong(children=self._normalize_inlines(node.children)))
                continue
            if isinstance(node, Emphasis):
                result.append(Emphasis(children=self._normalize_inlines(node.children)))
                continue
            if isinstance(node, Link):
                result.append(Link(
                    label=self._normalize_inlines(node.label),
                    target=node.target,
                ))
                continue
            if isinstance(node, Note):
                note = Note(
                    children=self._normalize_inlines(node.children),
                    number=self.note_counter,
                )
                self.note_counter += 1
                self.notes.append(note)
                result.append(note)
                continue
            if isinstance(node, InlineDirective):
                if node.name == "ref":
                    target = cast(str, node.attrs.get("target", ""))
                    result.append(NRef(target=target))
                    continue
                # Other inline directives not handled in v0.1 core
                continue
        return result

    def _heading_id(
        self,
        block: Heading,
        pending_anchor: str | None,
    ) -> tuple[str, str | None]:
        if pending_anchor is not None:
            return pending_anchor, None
        base = self._slugify(self._plain_text(block.children))
        count = self.slug_counts.get(base, 0) + 1
        self.slug_counts[base] = count
        slug = base if count == 1 else f"{base}-{count}"
        return slug, None

    def _consume_anchor(
        self,
        pending_anchor: str | None,
    ) -> tuple[str | None, str | None]:
        if pending_anchor is not None:
            return pending_anchor, None
        return None, None

    def _plain_text(self, inlines: list[InlineNode]) -> str:
        parts: list[str] = []
        for node in inlines:
            if isinstance(node, Text):
                parts.append(node.value)
            elif isinstance(node, CodeSpan):
                parts.append(node.value)
            elif isinstance(node, (Strong, Emphasis)):
                parts.append(self._plain_text(node.children))
            elif isinstance(node, Link):
                parts.append(self._plain_text(node.label))
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
