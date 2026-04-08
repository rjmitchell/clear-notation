"""ReDoS (Regular Expression Denial of Service) audit tests.

Verifies that all regex patterns used in the ClearNotation parser
complete in bounded time even on crafted adversarial inputs up to 10KB.

Audit date: 2026-04-07
Result: All patterns SAFE — no nested quantifiers, overlapping
alternations, or ambiguous quantifiers found.
"""

from __future__ import annotations

import re
import time
import unittest

from clearnotation_reference.patterns import (
    DOTTED_IDENTIFIER_RE,
    HEADING_RE,
    IDENTIFIER_RE,
    ORDERED_RE,
)


# Maximum allowed time (seconds) for any single regex match on a 10KB input.
MAX_TIME_S = 0.1


def _time_match(pattern: re.Pattern[str], text: str) -> float:
    """Return wall-clock seconds for a fullmatch/match attempt."""
    start = time.monotonic()
    pattern.search(text)
    return time.monotonic() - start


class TestReDoSIdentifierRE(unittest.TestCase):
    """IDENTIFIER_RE = r'[a-z][a-z0-9-]*'

    Safe: single character-class quantifier, no nesting.
    """

    def test_long_valid_identifier(self) -> None:
        text = "a" + "b" * 9_999
        elapsed = _time_match(IDENTIFIER_RE, text)
        self.assertLess(elapsed, MAX_TIME_S)

    def test_almost_match_then_fail(self) -> None:
        # Long run of valid chars followed by invalid char — forces
        # the engine to scan the whole thing and reject.
        text = "a" + "b" * 9_998 + "!"
        elapsed = _time_match(IDENTIFIER_RE, text)
        self.assertLess(elapsed, MAX_TIME_S)

    def test_no_match_uppercase(self) -> None:
        text = "A" * 10_000
        elapsed = _time_match(IDENTIFIER_RE, text)
        self.assertLess(elapsed, MAX_TIME_S)


class TestReDoSDottedIdentifierRE(unittest.TestCase):
    """DOTTED_IDENTIFIER_RE = r'[a-z][a-z0-9-]*(?:\\.[a-z][a-z0-9-]*)*'

    Safe: the literal '.' unambiguously separates repetitions.
    No overlap between [a-z0-9-] and '\\.'.
    """

    def test_long_dotted_chain(self) -> None:
        # e.g. "a.b.c.d..." — many dot-separated segments
        segments = ["ab"] * 3_000
        text = ".".join(segments)  # ~9000 chars
        elapsed = _time_match(DOTTED_IDENTIFIER_RE, text)
        self.assertLess(elapsed, MAX_TIME_S)

    def test_trailing_dots_no_match(self) -> None:
        # Trailing dots force the non-capturing group to fail after each dot
        text = "a" + ".a" * 2_000 + "." * 5_000
        elapsed = _time_match(DOTTED_IDENTIFIER_RE, text)
        self.assertLess(elapsed, MAX_TIME_S)

    def test_hyphens_and_digits(self) -> None:
        text = "a-1" + ".b-2" * 2_000
        elapsed = _time_match(DOTTED_IDENTIFIER_RE, text)
        self.assertLess(elapsed, MAX_TIME_S)


class TestReDoSHeadingRE(unittest.TestCase):
    """HEADING_RE = r'^(?P<indent>[ \\t]*)(?P<marker>#{1,6})(?P<space> ?)(?P<rest>.*)$'

    Safe: [ \\t]* is a single character class; #{1,6} is bounded;
    .* is terminal and consumes everything to $.
    """

    def test_long_indent(self) -> None:
        text = " " * 9_990 + "# hello"
        elapsed = _time_match(HEADING_RE, text)
        self.assertLess(elapsed, MAX_TIME_S)

    def test_long_rest(self) -> None:
        text = "## " + "x" * 9_997
        elapsed = _time_match(HEADING_RE, text)
        self.assertLess(elapsed, MAX_TIME_S)

    def test_no_heading_marker(self) -> None:
        # All spaces, no # — marker group fails, regex fails
        text = " " * 10_000
        elapsed = _time_match(HEADING_RE, text)
        self.assertLess(elapsed, MAX_TIME_S)

    def test_mixed_indent(self) -> None:
        text = " \t" * 4_000 + "### rest"
        elapsed = _time_match(HEADING_RE, text)
        self.assertLess(elapsed, MAX_TIME_S)


class TestReDoSOrderedRE(unittest.TestCase):
    """ORDERED_RE = r'^(?P<indent>[ \\t]*)(?P<number>\\d+)\\.(?P<space> ?)(?P<rest>.*)$'

    Safe: [ \\t]* and \\d+ are disjoint character classes;
    \\. is a literal anchor; .* is terminal.
    """

    def test_long_number(self) -> None:
        text = "1" * 9_990 + ". rest"
        elapsed = _time_match(ORDERED_RE, text)
        self.assertLess(elapsed, MAX_TIME_S)

    def test_long_indent_then_number(self) -> None:
        text = " " * 5_000 + "1" * 4_990 + ". x"
        elapsed = _time_match(ORDERED_RE, text)
        self.assertLess(elapsed, MAX_TIME_S)

    def test_no_dot_fails(self) -> None:
        # All digits, no dot — regex must fail without catastrophic backtracking
        text = "1" * 10_000
        elapsed = _time_match(ORDERED_RE, text)
        self.assertLess(elapsed, MAX_TIME_S)

    def test_spaces_then_digits_no_dot(self) -> None:
        # indent consumed, digits consumed, but no dot — potential
        # backtracking point between [ \t]* and \d+ is absent because
        # the character classes are disjoint.
        text = " " * 5_000 + "9" * 5_000
        elapsed = _time_match(ORDERED_RE, text)
        self.assertLess(elapsed, MAX_TIME_S)


class TestReDoSLSPPatterns(unittest.TestCase):
    """Patterns used in lsp.py (not imported, tested via raw re.compile)."""

    def test_directive_re(self) -> None:
        pattern = re.compile(r"::([\w]+)")
        text = "::" + "a" * 9_998
        elapsed = _time_match(pattern, text)
        self.assertLess(elapsed, MAX_TIME_S)

    def test_attr_open_re(self) -> None:
        pattern = re.compile(r"::\w+\s*\[")
        # Long word chars followed by spaces but no bracket — must fail fast
        text = "::" + "a" * 5_000 + " " * 4_998
        elapsed = _time_match(pattern, text)
        self.assertLess(elapsed, MAX_TIME_S)

    def test_attr_value_re(self) -> None:
        pattern = re.compile(r'=\s*"?\w*$')
        text = "=" + " " * 5_000 + '"' + "a" * 4_998
        elapsed = _time_match(pattern, text)
        self.assertLess(elapsed, MAX_TIME_S)

    def test_attr_key_value_re(self) -> None:
        pattern = re.compile(r'(\w+)\s*=\s*"?\w*$')
        text = "a" * 3_000 + " " * 1_000 + "=" + " " * 1_000 + '"' + "b" * 4_000
        elapsed = _time_match(pattern, text)
        self.assertLess(elapsed, MAX_TIME_S)


class TestReDoSValidatorPattern(unittest.TestCase):
    """Pattern from validator.py: r'^[a-zA-Z][a-zA-Z0-9+.-]*:'"""

    def test_long_scheme_no_colon(self) -> None:
        pattern = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")
        # Long valid scheme chars but no colon — must fail fast
        text = "a" + "b" * 9_999
        elapsed = _time_match(pattern, text)
        self.assertLess(elapsed, MAX_TIME_S)

    def test_long_scheme_with_colon(self) -> None:
        pattern = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")
        text = "a" + "b" * 9_998 + ":"
        elapsed = _time_match(pattern, text)
        self.assertLess(elapsed, MAX_TIME_S)


if __name__ == "__main__":
    unittest.main()
