"""Tests for the ClearNotation formatter."""

from __future__ import annotations

import unittest
from pathlib import Path

from clearnotation_reference.config import load_config
from clearnotation_reference.formatter import Formatter
from clearnotation_reference.parser import ReferenceParser
from clearnotation_reference.registry import Registry

REPO_ROOT = Path(__file__).resolve().parent.parent
VALID_DIR = REPO_ROOT / "fixtures" / "valid"


def _ast_to_dict(obj: object) -> object:
    if hasattr(obj, "__dataclass_fields__"):
        d: dict[str, object] = {"type": type(obj).__name__}
        for f in obj.__dataclass_fields__:
            if f == "source_line":
                continue
            d[f] = _ast_to_dict(getattr(obj, f))
        return d
    if isinstance(obj, list):
        return [_ast_to_dict(i) for i in obj]
    if isinstance(obj, dict):
        return {k: _ast_to_dict(v) for k, v in obj.items()}
    if isinstance(obj, Path):
        return str(obj)
    return obj


class FormatterRoundtripTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _, reg_data = load_config(VALID_DIR / "v01-minimal.cln")
        cls.registry = Registry.from_toml(reg_data)
        cls.formatter = Formatter(cls.registry)
        cls.parser = ReferenceParser(cls.registry)


def _make_roundtrip_test(fixture: Path):
    def test(self: FormatterRoundtripTests) -> None:
        source = fixture.read_text()
        formatted = self.formatter.format(source)
        doc1 = self.parser.parse_document(source, fixture)
        doc2 = self.parser.parse_document(formatted, Path("<fmt>"))
        ast1 = _ast_to_dict(doc1)
        ast2 = _ast_to_dict(doc2)
        self.assertEqual(ast1["meta"], ast2["meta"], f"Meta mismatch for {fixture.name}")
        self.assertEqual(ast1["blocks"], ast2["blocks"], f"Blocks mismatch for {fixture.name}")

    return test


def _make_idempotency_test(fixture: Path):
    def test(self: FormatterRoundtripTests) -> None:
        source = fixture.read_text()
        formatted_once = self.formatter.format(source)
        formatted_twice = self.formatter.format(formatted_once)
        self.assertEqual(formatted_once, formatted_twice, f"Not idempotent for {fixture.name}")

    return test


for _fixture in sorted(VALID_DIR.glob("*.cln")):
    _name = _fixture.stem.replace("-", "_")
    setattr(FormatterRoundtripTests, f"test_roundtrip_{_name}", _make_roundtrip_test(_fixture))
    setattr(FormatterRoundtripTests, f"test_idempotent_{_name}", _make_idempotency_test(_fixture))


class FormatterEdgeCaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _, reg_data = load_config(VALID_DIR / "v01-minimal.cln")
        cls.registry = Registry.from_toml(reg_data)
        cls.formatter = Formatter(cls.registry)

    def test_trailing_newline(self) -> None:
        result = self.formatter.format("# Hello")
        self.assertTrue(result.endswith("\n"))

    def test_empty_document(self) -> None:
        result = self.formatter.format("")
        self.assertIn(result, ("", "\n"))


if __name__ == "__main__":
    unittest.main()
