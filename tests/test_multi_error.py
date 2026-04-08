"""Tests for multi-error collection in the validator."""

from __future__ import annotations

import unittest
from pathlib import Path
from typing import Any

from clearnotation_reference.errors import (
    DiagnosticCollection,
    MultipleValidationFailures,
    ValidationFailure,
)
from clearnotation_reference.parser import ReferenceParser
from clearnotation_reference.registry import Registry
from clearnotation_reference.validator import ReferenceValidator


REPO_ROOT = Path(__file__).resolve().parent.parent
_BUILTIN_REGISTRY_PATH = REPO_ROOT / "clearnotation_reference" / "builtin-registry.toml"


def _load_registry() -> tuple[dict[str, Any], Registry]:
    import tomllib

    with open(_BUILTIN_REGISTRY_PATH, "rb") as f:
        reg_data = tomllib.load(f)
    return reg_data, Registry.from_toml(reg_data)


def _parse_and_validate(source: str, path: Path | None = None) -> None:
    """Parse then validate, letting exceptions propagate."""
    reg_data, registry = _load_registry()
    if path is None:
        path = REPO_ROOT / "test_input.cln"
    parser = ReferenceParser(registry)
    doc = parser.parse_document(source, path)
    config: dict[str, Any] = {"project": {"root": str(REPO_ROOT)}}
    validator = ReferenceValidator(registry)
    validator.validate(doc, config=config)


# ---------------------------------------------------------------------------
# DiagnosticCollection unit tests
# ---------------------------------------------------------------------------


class DiagnosticCollectionTests(unittest.TestCase):
    def test_empty_collection_no_errors(self) -> None:
        dc = DiagnosticCollection()
        self.assertFalse(dc.has_errors())
        dc.raise_if_errors()  # should not raise

    def test_single_error_raises_validation_failure(self) -> None:
        dc = DiagnosticCollection()
        err = ValidationFailure("test_kind", "test message", line=1)
        dc.add(err)
        self.assertTrue(dc.has_errors())
        with self.assertRaises(ValidationFailure) as ctx:
            dc.raise_if_errors()
        self.assertIs(ctx.exception, err)

    def test_multiple_errors_raises_multiple(self) -> None:
        dc = DiagnosticCollection()
        e1 = ValidationFailure("kind_a", "first", line=1)
        e2 = ValidationFailure("kind_b", "second", line=5)
        dc.add(e1)
        dc.add(e2)
        with self.assertRaises(MultipleValidationFailures) as ctx:
            dc.raise_if_errors()
        self.assertEqual(len(ctx.exception.errors), 2)
        self.assertIs(ctx.exception.errors[0], e1)
        self.assertIs(ctx.exception.errors[1], e2)

    def test_multiple_errors_message_format(self) -> None:
        dc = DiagnosticCollection()
        dc.add(ValidationFailure("a", "msg_a", line=3))
        dc.add(ValidationFailure("b", "msg_b"))
        with self.assertRaises(MultipleValidationFailures) as ctx:
            dc.raise_if_errors()
        msg = str(ctx.exception)
        self.assertIn("2 errors:", msg)
        self.assertIn("[a] msg_a (line 3)", msg)
        self.assertIn("[b] msg_b", msg)


# ---------------------------------------------------------------------------
# Validator multi-error integration tests
# ---------------------------------------------------------------------------


class ValidatorMultiErrorTests(unittest.TestCase):
    def test_single_error_raises_validation_failure(self) -> None:
        """A document with one validation error still raises ValidationFailure."""
        source = "# Valid heading\n\n::nonexistent_directive\n"
        # This is a parse error (unknown directive), not a validation error.
        # Use a validation-level error instead: unknown attribute on callout.
        source = '# Title\n\n::callout[kind="info", bogus="yes"] {\n\nHello\n\n}\n'
        with self.assertRaises(ValidationFailure) as ctx:
            _parse_and_validate(source)
        self.assertEqual(ctx.exception.kind, "unknown_attribute")

    def test_multiple_independent_block_errors_collected(self) -> None:
        """Multiple independent block-level errors are all reported."""
        # Block 1: callout with unknown attribute (line 3)
        # Block 2: another callout with missing required attribute (line 7)
        source = (
            "# Title\n"
            "\n"
            '::callout[kind="info", bogus="yes"] {\n'
            "\n"
            "Hello\n"
            "\n"
            "}\n"
            "\n"
            "::callout {\n"
            "\n"
            "World\n"
            "\n"
            "}\n"
        )
        with self.assertRaises(MultipleValidationFailures) as ctx:
            _parse_and_validate(source)
        errors = ctx.exception.errors
        self.assertEqual(len(errors), 2)
        kinds = [e.kind for e in errors]
        self.assertIn("unknown_attribute", kinds)
        self.assertIn("attribute_type_mismatch", kinds)

    def test_valid_blocks_between_errors_still_validate(self) -> None:
        """Valid blocks between error blocks are processed correctly."""
        # Error block, then valid block, then error block
        source = (
            "# Title\n"
            "\n"
            '::callout[kind="info", bogus="yes"] {\n'
            "\n"
            "Bad callout\n"
            "\n"
            "}\n"
            "\n"
            "This is a valid paragraph.\n"
            "\n"
            "::callout {\n"
            "\n"
            "Missing kind\n"
            "\n"
            "}\n"
        )
        with self.assertRaises(MultipleValidationFailures) as ctx:
            _parse_and_validate(source)
        errors = ctx.exception.errors
        self.assertEqual(len(errors), 2)
        # The valid paragraph in between should not cause any errors

    def test_unresolved_refs_collected_with_other_errors(self) -> None:
        """Unresolved refs are collected alongside block-level errors."""
        source = (
            "# Title\n"
            "\n"
            '::callout[kind="info", bogus="yes"] {\n'
            "\n"
            "Bad callout\n"
            "\n"
            "}\n"
            "\n"
            'See ::ref[target="nonexistent-section"] for details.\n'
        )
        with self.assertRaises(MultipleValidationFailures) as ctx:
            _parse_and_validate(source)
        errors = ctx.exception.errors
        kinds = [e.kind for e in errors]
        self.assertIn("unknown_attribute", kinds)
        self.assertIn("unresolved_ref", kinds)

    def test_duplicate_id_with_other_error_collected(self) -> None:
        """Duplicate ID errors are collected alongside other block errors."""
        # First anchor+heading uses "dupe" (fine).
        # Second anchor+heading tries "dupe" again (duplicate_id).
        # Third block: callout missing required kind attr.
        source = (
            '::anchor[id="dupe"]\n'
            "\n"
            "# First heading\n"
            "\n"
            '::anchor[id="dupe"]\n'
            "\n"
            "# Second heading\n"
            "\n"
            "::callout {\n"
            "\n"
            "No kind\n"
            "\n"
            "}\n"
        )
        with self.assertRaises(MultipleValidationFailures) as ctx:
            _parse_and_validate(source)
        errors = ctx.exception.errors
        kinds = [e.kind for e in errors]
        self.assertIn("duplicate_id", kinds)
        self.assertIn("attribute_type_mismatch", kinds)

    def test_error_message_includes_all_errors(self) -> None:
        """The MultipleValidationFailures message includes all error details."""
        source = (
            "# Title\n"
            "\n"
            '::callout[kind="info", bogus="yes"] {\n'
            "\n"
            "Bad\n"
            "\n"
            "}\n"
            "\n"
            "::callout {\n"
            "\n"
            "Also bad\n"
            "\n"
            "}\n"
        )
        with self.assertRaises(MultipleValidationFailures) as ctx:
            _parse_and_validate(source)
        msg = str(ctx.exception)
        self.assertIn("2 errors:", msg)
        self.assertIn("unknown_attribute", msg)
        self.assertIn("attribute_type_mismatch", msg)


if __name__ == "__main__":
    unittest.main()
