# Reference Parser Harness

This repository now includes a manifest-driven parser fixture harness under [clearnotation_harness](/Users/ryan/projects/clear-notation/clearnotation_harness).

## What it does

- loads [fixtures/manifest.toml](/Users/ryan/projects/clear-notation/fixtures/manifest.toml)
- resolves the reference project config at [clearnotation.toml](/Users/ryan/projects/clear-notation/clearnotation.toml)
- resolves the built-in registry snapshot at [reference/builtin-registry.toml](/Users/ryan/projects/clear-notation/reference/builtin-registry.toml)
- runs each fixture through an adapter-provided `parse()` and `validate()` implementation
- compares actual outcomes against manifest expectations

## Adapter contract

An adapter must provide:

```python
def parse(source: str, *, path, config, registry): ...
def validate(document, *, path, config, registry): ...
```

Parse rejections should raise `clearnotation_harness.ParseFailure(kind, message)`.
Validation rejections should raise `clearnotation_harness.ValidationFailure(kind, message)`.

## CLI

Run the full suite:

```bash
python3 -m clearnotation_harness --manifest fixtures/manifest.toml --adapter clearnotation_reference.adapter:create_adapter
```

Run a subset:

```bash
python3 -m clearnotation_harness --adapter your_module:create_adapter --case v01 --case x04
```

List cases without running them:

```bash
python3 -m clearnotation_harness --adapter your_module:create_adapter --list
```

## Intended next step

Use the reference adapter as the first implementation gate, then iterate on the parser behind the same fixture suite.
