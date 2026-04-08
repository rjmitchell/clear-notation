"""AST snapshot tests: compare normalized AST output against .ast.json sidecars."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from clearnotation_reference.config import load_config
from clearnotation_reference.normalizer import Normalizer
from clearnotation_reference.parser import ReferenceParser
from clearnotation_reference.registry import Registry
from clearnotation_reference.validator import ReferenceValidator
from clearnotation_reference.models import (
    NormalizedDocument,
    NormalizedInline,
    NormalizedBlock,
    Note,
    NHeading,
    NParagraph,
    NThematicBreak,
    NBlockQuote,
    NUnorderedList,
    NOrderedList,
    NToc,
    NCallout,
    NFigure,
    NMathBlock,
    NTable,
    NSourceBlock,
    NExtensionBlock,
    NRef,
    Text,
    CodeSpan,
    Strong,
    Emphasis,
    Link,
)

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "valid"


def serialize_inline(node: NormalizedInline) -> dict:
    if isinstance(node, Text):
        return {"type": "Text", "value": node.value}
    if isinstance(node, CodeSpan):
        return {"type": "CodeSpan", "value": node.value}
    if isinstance(node, Strong):
        return {"type": "Strong", "children": [serialize_inline(c) for c in node.children]}
    if isinstance(node, Emphasis):
        return {"type": "Emphasis", "children": [serialize_inline(c) for c in node.children]}
    if isinstance(node, Link):
        return {
            "type": "Link",
            "label": [serialize_inline(c) for c in node.label],
            "target": node.target,
        }
    if isinstance(node, Note):
        return {
            "type": "Note",
            "number": node.number,
            "children": [serialize_inline(c) for c in node.children],
        }
    if isinstance(node, NRef):
        return {"type": "NRef", "target": node.target}
    raise TypeError(f"Unknown inline node type: {type(node).__name__}")


def serialize_block(node: NormalizedBlock) -> dict:
    if isinstance(node, NHeading):
        return {
            "type": "NHeading",
            "level": node.level,
            "id": node.id,
            "content": [serialize_inline(c) for c in node.content],
        }
    if isinstance(node, NParagraph):
        return {
            "type": "NParagraph",
            "content": [serialize_inline(c) for c in node.content],
            "id": node.id,
        }
    if isinstance(node, NThematicBreak):
        return {"type": "NThematicBreak"}
    if isinstance(node, NBlockQuote):
        return {
            "type": "NBlockQuote",
            "lines": [[serialize_inline(c) for c in line] for line in node.lines],
            "id": node.id,
        }
    if isinstance(node, NUnorderedList):
        return {
            "type": "NUnorderedList",
            "items": [[serialize_inline(c) for c in item] for item in node.items],
            "id": node.id,
        }
    if isinstance(node, NOrderedList):
        return {
            "type": "NOrderedList",
            "items": [
                {
                    "type": "NOrderedItem",
                    "ordinal": item.ordinal,
                    "content": [serialize_inline(c) for c in item.content],
                }
                for item in node.items
            ],
            "id": node.id,
        }
    if isinstance(node, NToc):
        return {"type": "NToc", "id": node.id}
    if isinstance(node, NCallout):
        return {
            "type": "NCallout",
            "kind": node.kind,
            "title": node.title,
            "compact": node.compact,
            "blocks": [serialize_block(b) for b in node.blocks],
            "id": node.id,
        }
    if isinstance(node, NFigure):
        return {
            "type": "NFigure",
            "src": node.src,
            "blocks": [serialize_block(b) for b in node.blocks],
            "id": node.id,
        }
    if isinstance(node, NMathBlock):
        return {
            "type": "NMathBlock",
            "text": node.text,
            "id": node.id,
        }
    if isinstance(node, NTable):
        return {
            "type": "NTable",
            "header": node.header,
            "align": node.align,
            "rows": [
                {
                    "type": "NTableRow",
                    "cells": [
                        {
                            "type": "NTableCell",
                            "content": [serialize_inline(c) for c in cell.content],
                        }
                        for cell in row.cells
                    ],
                }
                for row in node.rows
            ],
            "id": node.id,
        }
    if isinstance(node, NSourceBlock):
        return {
            "type": "NSourceBlock",
            "language": node.language,
            "text": node.text,
            "id": node.id,
        }
    if isinstance(node, NExtensionBlock):
        return {
            "type": "NExtensionBlock",
            "type_name": node.type_name,
            "data": node.data,
            "blocks": [serialize_block(b) for b in node.blocks],
            "id": node.id,
        }
    raise TypeError(f"Unknown block node type: {type(node).__name__}")


def serialize_note(note: Note) -> dict:
    return {
        "type": "Note",
        "number": note.number,
        "children": [serialize_inline(c) for c in note.children],
    }


def serialize_document(ndoc: NormalizedDocument) -> dict:
    return {
        "meta": ndoc.meta,
        "blocks": [serialize_block(b) for b in ndoc.blocks],
        "notes": [serialize_note(n) for n in ndoc.notes],
    }


def _normalize_fixture(cln_path: Path) -> NormalizedDocument:
    config, reg_data = load_config(cln_path)
    registry = Registry.from_toml(reg_data)
    source = cln_path.read_text()
    doc = ReferenceParser(registry).parse_document(source, cln_path)
    ReferenceValidator(registry).validate(doc, config=config)
    return Normalizer(registry).normalize(doc)


class ASTSnapshotTests(unittest.TestCase):
    """Dynamically generated test for each .cln file with a .ast.json sidecar."""
    pass


def _make_snapshot_test(cln_path: Path, json_path: Path):
    def test(self: ASTSnapshotTests) -> None:
        ndoc = _normalize_fixture(cln_path)
        actual = serialize_document(ndoc)
        expected = json.loads(json_path.read_text())
        self.assertEqual(expected, actual, f"AST mismatch for {cln_path.name}")
    return test


# Discover and register test methods
for _cln in sorted(FIXTURES_DIR.glob("*.cln")):
    _json = _cln.with_suffix(".ast.json")
    if _json.exists():
        _test_name = f"test_ast_snapshot_{_cln.stem}"
        setattr(ASTSnapshotTests, _test_name, _make_snapshot_test(_cln, _json))


if __name__ == "__main__":
    unittest.main()
