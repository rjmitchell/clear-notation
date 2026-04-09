"""Document and registry models for the reference parser."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class AttributeSpec:
    name: str
    type_name: str
    required: bool
    default: Any = None
    allowed_values: tuple[str, ...] = ()
    cardinality: str | None = None


@dataclass(frozen=True)
class DirectiveSpec:
    name: str
    placement: str
    body_mode: str
    attributes: dict[str, AttributeSpec]


@dataclass
class Text:
    value: str


@dataclass
class CodeSpan:
    value: str


@dataclass
class Strong:
    children: list["InlineNode"]


@dataclass
class Emphasis:
    children: list["InlineNode"]


@dataclass
class Link:
    label: list["InlineNode"]
    target: str


@dataclass
class Note:
    children: list["InlineNode"]
    number: int | None = None


@dataclass
class InlineDirective:
    name: str
    attrs: dict[str, Any]


InlineNode = Text | CodeSpan | Strong | Emphasis | Link | Note | InlineDirective


@dataclass
class Heading:
    level: int
    children: list[InlineNode]
    id: str | None = None
    source_line: int | None = None


@dataclass
class Paragraph:
    children: list[InlineNode]
    id: str | None = None
    source_line: int | None = None


@dataclass
class BlockQuote:
    lines: list[list[InlineNode]]
    id: str | None = None
    source_line: int | None = None


@dataclass
class ListItem:
    """A single item in a list. May contain inline content and nested blocks."""
    children: list[InlineNode]
    blocks: list["BlockNode"] = field(default_factory=list)
    source_line: int | None = None


@dataclass
class UnorderedList:
    items: list[ListItem]
    id: str | None = None
    source_line: int | None = None


@dataclass
class OrderedItem:
    ordinal: int
    children: list[InlineNode]
    blocks: list["BlockNode"] = field(default_factory=list)
    source_line: int | None = None


@dataclass
class OrderedList:
    items: list[OrderedItem]
    id: str | None = None
    source_line: int | None = None


@dataclass
class Comment:
    text: str
    source_line: int | None = None


@dataclass
class ThematicBreak:
    source_line: int | None = None


@dataclass
class SourceBlock:
    language: str
    text: str
    id: str | None = None
    source_line: int | None = None


@dataclass
class BlockDirective:
    name: str
    attrs: dict[str, Any]
    body_mode: str
    blocks: list["BlockNode"] = field(default_factory=list)
    raw_text: str = ""
    id: str | None = None
    source_line: int | None = None


BlockNode = (
    Heading
    | Paragraph
    | BlockQuote
    | UnorderedList
    | OrderedList
    | ThematicBreak
    | SourceBlock
    | BlockDirective
    | Comment
)


@dataclass
class Document:
    path: Path
    meta: dict[str, Any]
    blocks: list[BlockNode]


# ---------------------------------------------------------------------------
# Normalized AST nodes (renderer-facing, produced by the normalizer)
# ---------------------------------------------------------------------------

@dataclass
class NRef:
    target: str


NormalizedInline = Text | CodeSpan | Strong | Emphasis | Link | Note | NRef


@dataclass
class NHeading:
    level: int
    id: str
    content: list[NormalizedInline]


@dataclass
class NParagraph:
    content: list[NormalizedInline]
    id: str | None = None


@dataclass
class NThematicBreak:
    pass


@dataclass
class NBlockQuote:
    lines: list[list[NormalizedInline]]
    id: str | None = None


@dataclass
class NListItem:
    """Normalized list item with inline content and optional nested blocks."""
    content: list[NormalizedInline]
    blocks: list["NormalizedBlock"] = field(default_factory=list)


@dataclass
class NUnorderedList:
    items: list[NListItem]
    id: str | None = None


@dataclass
class NOrderedItem:
    ordinal: int
    content: list[NormalizedInline]
    blocks: list["NormalizedBlock"] = field(default_factory=list)


@dataclass
class NOrderedList:
    items: list[NOrderedItem]
    id: str | None = None


@dataclass
class NToc:
    id: str | None = None


@dataclass
class NCallout:
    kind: str
    title: str | None
    compact: bool
    blocks: list["NormalizedBlock"]
    id: str | None = None


@dataclass
class NFigure:
    src: str
    blocks: list["NormalizedBlock"]
    id: str | None = None


@dataclass
class NMathBlock:
    text: str
    id: str | None = None


@dataclass
class NTableCell:
    content: list[NormalizedInline]


@dataclass
class NTableRow:
    cells: list[NTableCell]


@dataclass
class NTable:
    header: bool
    align: list[str] | None
    rows: list[NTableRow]
    id: str | None = None


@dataclass
class NSourceBlock:
    language: str
    text: str
    id: str | None = None


@dataclass
class NExtensionBlock:
    type_name: str
    data: dict[str, Any]
    blocks: list["NormalizedBlock"] = field(default_factory=list)
    id: str | None = None


@dataclass
class NExtensionInline:
    type_name: str
    data: dict[str, Any]


NormalizedBlock = (
    NHeading
    | NParagraph
    | NThematicBreak
    | NBlockQuote
    | NUnorderedList
    | NOrderedList
    | NToc
    | NCallout
    | NFigure
    | NMathBlock
    | NTable
    | NSourceBlock
    | NExtensionBlock
)


@dataclass
class NormalizedDocument:
    meta: dict[str, Any]
    blocks: list[NormalizedBlock]
    notes: list[Note]
