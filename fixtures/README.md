# ClearNotation Conformance Suite

Language-agnostic test fixtures for any ClearNotation implementation.

## Structure

```
fixtures/
  manifest.toml              # Test case registry (TOML)
  escaping-matrix.json       # Cross-language escaping test cases
  valid/
    v01-minimal.cln          # Input CLN source
    v01-minimal.ast.json     # Expected normalized AST (JSON)
    v01-minimal.html         # Expected HTML body output
    ...
  parse-invalid/             # Expected to fail at parse time
  validate-invalid/          # Expected to fail at validation time
```

## Three-tier conformance

Each valid fixture has three representations:

1. `.cln` -- the source document
2. `.ast.json` -- the expected normalized AST after parse + validate + normalize
3. `.html` -- the expected HTML body output after rendering

An implementation passes a fixture if:
- Parse succeeds (no parse errors)
- Validation succeeds (no semantic errors)
- Normalized AST matches `.ast.json` (structural equality, ignoring key order)
- Rendered HTML matches `.html` (exact string match after whitespace normalization)

## Running with the Python harness

```bash
python3 -m clearnotation_harness \
  --manifest fixtures/manifest.toml \
  --adapter clearnotation_reference.adapter:create_adapter
```

## Running with JavaScript

```bash
cd clearnotation-js && pnpm test
```

The JS test suite loads fixtures from `../fixtures/valid/` and compares normalized AST and HTML output against the shared snapshots.

## Adding a new fixture

1. Create `valid/vNN-description.cln`
2. Run `python3 -m clearnotation_reference.cli ast <file>` to generate the AST
3. Save AST output as `valid/vNN-description.ast.json`
4. Run `python3 -m clearnotation_reference.cli build <file> -o <html>`, extract body content
5. Save as `valid/vNN-description.html`
6. Add a `[[case]]` entry to `manifest.toml`

## Escaping matrix

`escaping-matrix.json` defines expected escaping behavior across three domains:
- `inline` -- how special characters are handled in parsed text
- `attribute` -- how characters are escaped in quoted attribute strings
- `table` -- how pipe and backslash are handled in table cells

Any implementation can load this JSON and verify its escaping logic matches.
