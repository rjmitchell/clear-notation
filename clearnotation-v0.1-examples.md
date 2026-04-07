# ClearNotation v0.1 Examples And Negative Cases

This document acts as the first conformance corpus for ClearNotation v0.1. The snippets are small on purpose: each one isolates a syntax or validation rule from the grammar and companion notes.

The snippets are normative for acceptance and rejection outcomes:

- a `valid` example must parse and validate under the stated assumptions
- a `parse-invalid` example must be rejected during parse
- a `validate-invalid` example must parse but fail validation

Exact diagnostic wording is non-normative. Parsers and validators may report richer errors, but they must reject the same cases.

The same corpus now exists as runnable fixture files under [fixtures/manifest.toml](/Users/ryan/projects/clear-notation/fixtures/manifest.toml).

## Assumptions

Unless a case says otherwise, examples assume:

- the core built-in registry from [clearnotation-v0.1-config.md](/Users/ryan/projects/clear-notation/clearnotation-v0.1-config.md)
- no additional project directives
- a project root containing the current document
- HTML as the primary render target

## Valid cases

### V-01 Minimal document

Expected:

- parse: accept
- validate: accept

```text
# ClearNotation

A docs-first markup language.
```

### V-02 Metadata and core inline forms

Expected:

- parse: accept
- validate: accept

```text
::meta{
title = "ClearNotation"
draft = true
authors = ["Three Raccoons in a Trenchcoat", "Core Team"]
}

# Intro

ClearNotation uses +{strong}, *{emphasis}, `code`, [links -> /docs/intro], and ^{inline notes}.
```

### V-03 Link label formatting and note-local linking

Expected:

- parse: accept
- validate: accept

```text
# API

[+{API} reference -> /api]

^{See [the guide -> /guide] before deployment.}
```

### V-04 Flat lists and flat blockquotes

Expected:

- parse: accept
- validate: accept

```text
# Rules

- One syntax per concept
- No inline HTML
- Fail closed

1. Parse
2. Validate
3. Render

> Clear syntax helps tools.
> Clear constraints help authors.
```

### V-05 Fenced code with a required language tag

Expected:

- parse: accept
- validate: accept

````text
# Example

```text
name = "ClearNotation"
```
````

### V-06 Parsed block directive

Expected:

- parse: accept
- validate: accept

```text
::callout[kind="warning", title="Status"]{
Read the grammar before extending the syntax.
}
```

### V-07 Raw block directives

Expected:

- parse: accept
- validate: accept

```text
::math{
\int_0^1 x^2 dx
}

::table[header=true, align=["left", "right"]]{
Name | Value
Mode | Deterministic
Notes | Inline only
}
```

### V-08 Explicit anchors and refs

Expected:

- parse: accept
- validate: accept

```text
::anchor[id="grammar"]
# Grammar

See ::ref[target="grammar"] for the canonical syntax.
```

### V-09 Include under a valid project-relative path

Expected:

- parse: accept
- validate: accept if `partials/intro.cln` exists inside an allowed include root

```text
# Main

::include[src="partials/intro.cln"]
```

### V-10 Escaped opener text in restricted contexts

Expected:

- parse: accept
- validate: accept

```text
# Escapes

+{Write \[ literally inside strong text.}

^{Use \^{ when you mean the literal opener, not a nested note.}
```

## Parse-invalid cases

### P-01 `::meta` not first

Expected:

- parse: reject

```text
# Intro

::meta{
title = "Late metadata"
}
```

### P-02 Missing required space after heading marker

Expected:

- parse: reject

```text
#Bad heading
```

### P-03 Missing code fence language tag

Expected:

- parse: reject

````text
```
plain text
```
````

### P-04 Unclosed note

Expected:

- parse: reject

```text
Paragraph with ^{an unclosed note.
```

### P-05 Unknown inline directive

Expected:

- parse: reject

```text
Paragraph with ::unknown[target="x"] in the middle.
```

### P-06 Unsupported nested construct inside strong text

Expected:

- parse: reject

```text
+{A [link -> /x] is not allowed directly inside strong text.}
```

### P-07 Invalid escape sequence

Expected:

- parse: reject

```text
This is not valid: \q
```

### P-08 Link target with an unescaped space

Expected:

- parse: reject

```text
[spec -> /docs/spec draft]
```

### P-09 Unknown block directive

Expected:

- parse: reject

```text
::diagram[kind="flow"]{
A -> B
}
```

### P-10 Standalone closer outside a directive body

Expected:

- parse: reject

```text
}
```

## Validate-invalid cases

### X-01 Unknown attribute on a built-in directive

Expected:

- parse: accept
- validate: reject

```text
::callout[kind="warning", tone="calm"]{
Unknown attributes must fail closed.
}
```

### X-02 Wrong attribute type

Expected:

- parse: accept
- validate: reject

```text
::table[header="yes"]{
Name | Value
A | B
}
```

### X-03 `::anchor` with no following addressable block

Expected:

- parse: accept
- validate: reject

```text
::anchor[id="lonely"]
```

### X-04 Unresolved ref target

Expected:

- parse: accept
- validate: reject

```text
# Intro

See ::ref[target="missing-section"].
```

### X-05 Duplicate explicit IDs

Expected:

- parse: accept
- validate: reject

```text
::anchor[id="same"]
# First

::anchor[id="same"]
# Second
```

### X-06 Include escaping the project root

Expected:

- parse: accept
- validate: reject

```text
::include[src="../../../secret.cln"]
```

### X-07 Missing include target

Expected:

- parse: accept
- validate: reject if `partials/missing.cln` does not exist

```text
::include[src="partials/missing.cln"]
```

### X-08 Empty heading slug without explicit anchor

Expected:

- parse: accept
- validate: reject

```text
# ^{Only a note}
```

## Coverage notes

This first suite intentionally covers:

- the reserved `::meta` preamble
- every core inline form
- every core block family
- the parser/validator split
- fail-closed behavior for directives, escapes, refs, and includes

It does not yet try to cover every built-in attribute permutation. That should be added as directive-specific conformance cases once the built-in schemas are frozen in more detail.
