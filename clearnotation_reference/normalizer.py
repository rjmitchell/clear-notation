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
    NBlockQuote,
    NCallout,
    NExtensionBlock,
    NFigure,
    NHeading,
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

    def normalize(self, document: Document) -> NormalizedDocument:
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
                    items=[self._normalize_inlines(item) for item in block.items],
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
            # Include resolution is validated; in v0.1 we don't inline the content
            # during normalization (the validator already checked the path exists).
            # A future version will recursively parse and inline.
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
