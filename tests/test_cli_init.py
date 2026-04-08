"""Tests for the `cln init` subcommand."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from clearnotation_reference.cli import main, INIT_CONFIG, INIT_DOCUMENT
from clearnotation_reference.config import load_config
from clearnotation_reference.parser import ReferenceParser
from clearnotation_reference.registry import Registry
from clearnotation_reference.validator import ReferenceValidator


class TestCLIInit(unittest.TestCase):
    def test_init_creates_project(self):
        """cln init creates clearnotation.toml and docs/index.cln."""
        with tempfile.TemporaryDirectory() as tmp:
            ret = main(["init", tmp])
            self.assertEqual(ret, 0)
            self.assertTrue((Path(tmp) / "clearnotation.toml").exists())
            self.assertTrue((Path(tmp) / "docs" / "index.cln").exists())

    def test_init_file_contents(self):
        """Generated files contain the expected template content."""
        with tempfile.TemporaryDirectory() as tmp:
            main(["init", tmp])
            config_text = (Path(tmp) / "clearnotation.toml").read_text()
            doc_text = (Path(tmp) / "docs" / "index.cln").read_text()
            self.assertEqual(config_text, INIT_CONFIG)
            self.assertEqual(doc_text, INIT_DOCUMENT)

    def test_init_generated_document_is_valid(self):
        """The scaffolded index.cln parses and validates without errors."""
        with tempfile.TemporaryDirectory() as tmp:
            main(["init", tmp])
            cln_path = Path(tmp) / "docs" / "index.cln"
            config, reg_data = load_config(cln_path, str(Path(tmp) / "clearnotation.toml"))
            registry = Registry.from_toml(reg_data)
            source = cln_path.read_text(encoding="utf-8")
            doc = ReferenceParser(registry).parse_document(source, cln_path)
            # Should not raise
            ReferenceValidator(registry).validate(doc, config=config)

    def test_init_fails_if_config_exists(self):
        """cln init refuses to overwrite an existing clearnotation.toml."""
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "clearnotation.toml").write_text("existing")
            ret = main(["init", tmp])
            self.assertEqual(ret, 1)
            # Original content should be untouched
            self.assertEqual((Path(tmp) / "clearnotation.toml").read_text(), "existing")

    def test_init_creates_subdirectory(self):
        """cln init creates the target directory if it does not exist."""
        with tempfile.TemporaryDirectory() as tmp:
            sub = str(Path(tmp) / "nested" / "project")
            ret = main(["init", sub])
            self.assertEqual(ret, 0)
            self.assertTrue((Path(sub) / "clearnotation.toml").exists())
            self.assertTrue((Path(sub) / "docs" / "index.cln").exists())

    def test_init_defaults_to_current_directory(self):
        """cln init with no argument defaults to '.'."""
        import os
        with tempfile.TemporaryDirectory() as tmp:
            old_cwd = os.getcwd()
            try:
                os.chdir(tmp)
                ret = main(["init"])
                self.assertEqual(ret, 0)
                self.assertTrue((Path(tmp) / "clearnotation.toml").exists())
                self.assertTrue((Path(tmp) / "docs" / "index.cln").exists())
            finally:
                os.chdir(old_cwd)


if __name__ == "__main__":
    unittest.main()
