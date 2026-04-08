#!/usr/bin/env python3
"""Generate .ast.json sidecar files for each valid fixture .cln file."""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from clearnotation_reference.config import load_config
from clearnotation_reference.parser import ReferenceParser
from clearnotation_reference.validator import ReferenceValidator
from clearnotation_reference.normalizer import Normalizer
from clearnotation_reference.registry import Registry
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


def serialize_inline(node: NormalizedInline) -> dict:
    """Serialize a normalized inline node to a dict with a 'type' key."""
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
    """Serialize a normalized block node to a dict with a 'type' key."""
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
    """Serialize a collected note."""
    return {
        "type": "Note",
        "number": note.number,
        "children": [serialize_inline(c) for c in note.children],
    }


def serialize_document(ndoc: NormalizedDocument) -> dict:
    """Serialize a NormalizedDocument to a JSON-friendly dict."""
    return {
        "meta": ndoc.meta,
        "blocks": [serialize_block(b) for b in ndoc.blocks],
        "notes": [serialize_note(n) for n in ndoc.notes],
    }


def main() -> None:
    fixtures_dir = REPO_ROOT / "fixtures" / "valid"
    cln_files = sorted(fixtures_dir.glob("*.cln"))

    generated = 0
    skipped = 0

    for cln_path in cln_files:
        name = cln_path.stem
        try:
            config, reg_data = load_config(cln_path)
            registry = Registry.from_toml(reg_data)

            parser = ReferenceParser(registry)
            source = cln_path.read_text()
            doc = parser.parse_document(source, cln_path)

            validator = ReferenceValidator(registry)
            validator.validate(doc, config=config)

            normalizer = Normalizer(registry)
            ndoc = normalizer.normalize(doc)

            data = serialize_document(ndoc)
            out_path = cln_path.with_suffix(".ast.json")
            out_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
            print(f"  OK  {name}")
            generated += 1
        except Exception as exc:
            print(f"  SKIP {name}: {exc}")
            skipped += 1

    print(f"\nGenerated {generated} snapshot(s), skipped {skipped}.")


if __name__ == "__main__":
    main()
