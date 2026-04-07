"""Shared lexical patterns and escape tables for the reference parser."""

from __future__ import annotations

import re


IDENTIFIER_RE = re.compile(r"[a-z][a-z0-9-]*")
DOTTED_IDENTIFIER_RE = re.compile(r"[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*")
HEADING_RE = re.compile(r"^(?P<indent>[ \t]*)(?P<marker>#{1,6})(?P<space> ?)(?P<rest>.*)$")
ORDERED_RE = re.compile(r"^(?P<indent>[ \t]*)(?P<number>\d+)\.(?P<space> ?)(?P<rest>.*)$")

TEXT_ESCAPES = {
    "\\": "\\",
    "{": "{",
    "}": "}",
    "[": "[",
    "]": "]",
    "`": "`",
    "+": "+",
    "*": "*",
    "^": "^",
    ":": ":",
    ">": ">",
    "-": "-",
    "#": "#",
}

STRING_ESCAPES = {
    "\\": "\\",
    '"': '"',
    "n": "\n",
    "r": "\r",
    "t": "\t",
}

LINK_TARGET_ESCAPES = {
    "\\": "\\",
    "]": "]",
}
