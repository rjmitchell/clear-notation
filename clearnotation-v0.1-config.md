# ClearNotation v0.1 Project Config

This note defines the v0.1 contract for `clearnotation.toml`. It is not a re-specification of TOML itself; the file uses standard TOML syntax. The goal here is to freeze the typed registry format that the ClearNotation parser and validator consume.

## Scope

`clearnotation.toml` is the only place where project-trusted directives and extension capabilities are declared.

- Documents do not declare executable hooks
- Documents do not extend the grammar
- The parser may read static directive signatures from this file before parsing document bodies
- Validation and transform phases may read the full typed registry from this file after parse

`::meta{...}` is not declared here. It is reserved core syntax.

## Required top-level fields

```toml
spec = "0.1"
```

Rules:

- `spec` is required
- v0.1 compilers must fail if `spec` is missing or unsupported

## Optional project settings

```toml
[project]
root = "."
main = "docs/index.cln"

[render]
primary = "html"
secondary = ["pdf"]

[includes]
roots = ["docs", "shared"]
```

Rules:

- `project.root` defaults to `.`
- `render.primary` defaults to `html`
- `render.secondary` defaults to `[]`
- `includes.roots` defaults to `[project.root]`
- include roots are still subject to the document-level include rules from the syntax spec; config may narrow the allowlist, not widen it beyond `project.root`

## Extension registry shape

Extensions are declared under `[extensions.<id>]`, where `<id>` is a lowercase identifier using letters, digits, and `-`, beginning with a letter.

Example:

```toml
[extensions.core]
trusted = true
phases = ["validate", "transform", "render"]
capabilities = []

[[extensions.core.directive]]
name = "toc"
placement = "block"
body_mode = "none"
emits = ["toc"]

[extensions.core.directive.attributes]

[[extensions.core.directive]]
name = "ref"
placement = "inline"
body_mode = "none"
emits = ["ref"]

[extensions.core.directive.attributes]
target = "string"

[[extensions.core.directive]]
name = "callout"
placement = "block"
body_mode = "parsed"
emits = ["callout"]

[extensions.core.directive.attributes]
kind = "string"
title = "string?"
compact = "boolean?"
```

## Extension fields

Each `[extensions.<id>]` table supports:

- `enabled = true | false`
- `trusted = true | false`
- `phases = ["validate" | "transform" | "render" | "postprocess", ...]`
- `capabilities = [capability_name, ...]`

Rules:

- `enabled` defaults to `true`
- `trusted` is required
- `phases` is required and may not be empty
- `capabilities` is required and may be empty
- v0.1 capability names are lowercase identifiers with `-`
- an untrusted extension must not be loaded
- a directive declared by a disabled or untrusted extension is treated as unavailable

## Directive fields

Each `[[extensions.<id>.directive]]` table supports:

- `name`
- `placement`
- `body_mode`
- `emits`

Required values:

- `name` is a lowercase identifier with optional `-`
- `placement` is `block` or `inline`
- `body_mode` is `none`, `parsed`, or `raw`
- `emits` is a non-empty array of typed AST node names

Rules:

- Directive names are unique across the full project registry
- `meta` is reserved core syntax and may not be declared as a directive name
- An inline directive must use `body_mode = "none"`
- If a directive name is declared more than once, config validation fails
- The parser extracts only `name`, `placement`, and `body_mode`
- Later phases may also consume `emits`, attributes, phases, and capabilities

## Attribute schemas

Each directive may declare an `[extensions.<id>.directive.attributes]` table.

Example:

```toml
[extensions.cite.directive.attributes]
target = "string"
style = "string?"
compact = "boolean?"
tags = "string[]?"
```

Supported v0.1 type atoms are:

- `string`
- `integer`
- `boolean`

Supported v0.1 array types are:

- `string[]`
- `integer[]`
- `boolean[]`

Optional fields append `?`:

- `string?`
- `integer?`
- `boolean?`
- `string[]?`
- `integer[]?`
- `boolean[]?`

Rules:

- Missing attributes are allowed only for optional schema entries
- Unknown attributes fail validation
- Nested objects, enums, unions, floats, and dates are not part of the v0.1 attribute type system

## Built-in baseline registry

Every v0.1 compiler starts with this core registry before loading project extensions:

- `toc`: block, none
- `ref`: inline, none
- `anchor`: block, none
- `include`: block, none
- `callout`: block, parsed
- `figure`: block, parsed
- `math`: block, raw
- `table`: block, raw
- `source`: block, raw

`meta` is intentionally absent from this list because it is part of the core document grammar, not the extension registry.

Project config may add directives, but it may not redefine any of the built-in names above.

## Built-in directive schemas

The v0.1 built-ins carry these attribute schemas and defaults:

- `toc`: no attributes
- `ref`: `target: string`
- `anchor`: `id: string`
- `include`: `src: string`
- `callout`: `kind: string`, `title: string?`, `compact: boolean?` with default `false`
- `figure`: `src: string`
- `math`: no attributes
- `table`: `header: boolean?` with default `false`, `align: string[]?`
- `source`: `language: string`

Additional built-in constraints:

- `table.align`, when present, must contain only `left`, `center`, or `right`
- if `table.align` is present, its length must match the post-parse column count
- `ref.target`, `anchor.id`, `include.src`, `figure.src`, and `source.language` are required
- built-ins fail on unknown attributes just like extension directives do

## Fail-closed config rules

Compilers must fail on:

- missing or unsupported `spec`
- duplicate directive names
- use of reserved core names as directive names
- invalid `placement`
- invalid `body_mode`
- inline directives with non-`none` body modes
- unknown attribute type strings
- empty `emits`
- unavailable capabilities requested by an extension

This keeps `clearnotation.toml` typed, reviewable, and small enough to audit alongside the document grammar.

The repository also ships a machine-readable built-in snapshot at [reference/builtin-registry.toml](/Users/ryan/projects/clear-notation/reference/builtin-registry.toml) and a reference project config at [clearnotation.toml](/Users/ryan/projects/clear-notation/clearnotation.toml).
