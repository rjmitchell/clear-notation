"""Tests for include inlining during normalization."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from clearnotation_reference.config import load_config
from clearnotation_reference.errors import ValidationFailure
from clearnotation_reference.models import NHeading, NParagraph
from clearnotation_reference.normalizer import Normalizer
from clearnotation_reference.parser import ReferenceParser
from clearnotation_reference.registry import Registry
from clearnotation_reference.validator import ReferenceValidator

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "valid"

MINIMAL_TOML = '[spec]\nversion = "0.1"\n[project]\nroot = "."\n'


def _registry():
    _, reg_data = load_config(FIXTURE_DIR / "v01-minimal.cln")
    return Registry.from_toml(reg_data)


def _full_pipeline(source: str, path: Path):
    """Parse, validate, normalize a document."""
    registry = _registry()
    config, _ = load_config(path)
    parser = ReferenceParser(registry)
    doc = parser.parse_document(source, path)
    validator = ReferenceValidator(registry)
    validator.validate(doc, config=config)
    normalizer = Normalizer(registry)
    return normalizer.normalize(doc, source_path=path, config=config)


class TestIncludeInlining(unittest.TestCase):
    def test_single_include_inlines_content(self) -> None:
        """::include should be replaced by the target file's blocks."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "clearnotation.toml").write_text(MINIMAL_TOML)
            (root / "chapter.cln").write_text("# Chapter\n\nChapter content.\n")
            main = root / "main.cln"
            main.write_text('::include[src="chapter.cln"]\n')

            ndoc = _full_pipeline(main.read_text(), main)
            self.assertEqual(len(ndoc.blocks), 2)  # heading + paragraph
            self.assertIsInstance(ndoc.blocks[0], NHeading)
            self.assertEqual(ndoc.blocks[0].content[0].value, "Chapter")
            self.assertIsInstance(ndoc.blocks[1], NParagraph)
            self.assertEqual(ndoc.blocks[1].content[0].value, "Chapter content.")

    def test_included_meta_is_discarded(self) -> None:
        """Only the root document's meta survives; included meta is dropped."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "clearnotation.toml").write_text(MINIMAL_TOML)
            (root / "part.cln").write_text(
                '::meta{\ntitle = "Part"\n}\n\n# Part Heading\n'
            )
            main = root / "main.cln"
            main.write_text(
                '::meta{\ntitle = "Main"\n}\n\n::include[src="part.cln"]\n'
            )
            ndoc = _full_pipeline(main.read_text(), main)
            self.assertEqual(ndoc.meta["title"], "Main")
            # Part's heading should be inlined
            self.assertEqual(len(ndoc.blocks), 1)
            self.assertEqual(ndoc.blocks[0].content[0].value, "Part Heading")

    def test_circular_include_raises(self) -> None:
        """Circular includes must produce a clear error."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "clearnotation.toml").write_text(MINIMAL_TOML)
            (root / "a.cln").write_text('::include[src="b.cln"]\n')
            (root / "b.cln").write_text('::include[src="a.cln"]\n')
            main = root / "a.cln"
            with self.assertRaises(Exception) as ctx:
                _full_pipeline(main.read_text(), main)
            self.assertIn("circular", str(ctx.exception).lower())

    def test_self_include_raises(self) -> None:
        """A file including itself is circular."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "clearnotation.toml").write_text(MINIMAL_TOML)
            main = root / "main.cln"
            main.write_text('::include[src="main.cln"]\n')
            with self.assertRaises(Exception) as ctx:
                _full_pipeline(main.read_text(), main)
            self.assertIn("circular", str(ctx.exception).lower())

    def test_depth_exceeded_raises(self) -> None:
        """Include chains deeper than 10 levels produce an error."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "clearnotation.toml").write_text(MINIMAL_TOML)
            # Create 12-deep include chain
            for i in range(12):
                next_file = f"f{i + 1}.cln" if i < 11 else ""
                content = (
                    f'::include[src="{next_file}"]\n' if next_file else "# Leaf\n"
                )
                (root / f"f{i}.cln").write_text(content)
            main = root / "f0.cln"
            with self.assertRaises(Exception) as ctx:
                _full_pipeline(main.read_text(), main)
            self.assertIn("depth", str(ctx.exception).lower())

    def test_heading_slugs_deduplicated_across_includes(self) -> None:
        """Heading IDs from included files share slug collision tracking."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "clearnotation.toml").write_text(MINIMAL_TOML)
            (root / "part.cln").write_text("# Title\n")
            main = root / "main.cln"
            main.write_text('# Title\n\n::include[src="part.cln"]\n')
            ndoc = _full_pipeline(main.read_text(), main)
            ids = [b.id for b in ndoc.blocks if hasattr(b, "id") and isinstance(b, NHeading)]
            self.assertEqual(ids[0], "title")
            self.assertEqual(ids[1], "title-2")

    def test_multiple_includes_in_sequence(self) -> None:
        """Multiple ::include directives inline in document order."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "clearnotation.toml").write_text(MINIMAL_TOML)
            (root / "a.cln").write_text("# Part A\n")
            (root / "b.cln").write_text("# Part B\n")
            main = root / "main.cln"
            main.write_text(
                '::include[src="a.cln"]\n\n::include[src="b.cln"]\n'
            )
            ndoc = _full_pipeline(main.read_text(), main)
            self.assertEqual(len(ndoc.blocks), 2)
            self.assertEqual(ndoc.blocks[0].content[0].value, "Part A")
            self.assertEqual(ndoc.blocks[1].content[0].value, "Part B")

    def test_nested_includes(self) -> None:
        """An included file may itself contain includes (transitive)."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "clearnotation.toml").write_text(MINIMAL_TOML)
            (root / "leaf.cln").write_text("Leaf content.\n")
            (root / "mid.cln").write_text('::include[src="leaf.cln"]\n')
            main = root / "main.cln"
            main.write_text('# Top\n\n::include[src="mid.cln"]\n')
            ndoc = _full_pipeline(main.read_text(), main)
            self.assertEqual(len(ndoc.blocks), 2)
            self.assertEqual(ndoc.blocks[1].content[0].value, "Leaf content.")

    def test_include_notes_renumbered(self) -> None:
        """Notes from included files continue numbering from the root document."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "clearnotation.toml").write_text(MINIMAL_TOML)
            (root / "part.cln").write_text("Text with a ^{included note}.\n")
            main = root / "main.cln"
            main.write_text(
                'Root ^{first note}.\n\n::include[src="part.cln"]\n'
            )
            ndoc = _full_pipeline(main.read_text(), main)
            self.assertEqual(len(ndoc.notes), 2)
            self.assertEqual(ndoc.notes[0].number, 1)
            self.assertEqual(ndoc.notes[1].number, 2)

    def test_include_with_surrounding_content(self) -> None:
        """Include between other blocks integrates seamlessly."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "clearnotation.toml").write_text(MINIMAL_TOML)
            (root / "part.cln").write_text("## Middle\n")
            main = root / "main.cln"
            main.write_text(
                '# Start\n\n::include[src="part.cln"]\n\n# End\n'
            )
            ndoc = _full_pipeline(main.read_text(), main)
            self.assertEqual(len(ndoc.blocks), 3)
            self.assertEqual(ndoc.blocks[0].content[0].value, "Start")
            self.assertEqual(ndoc.blocks[1].content[0].value, "Middle")
            self.assertEqual(ndoc.blocks[2].content[0].value, "End")


if __name__ == "__main__":
    unittest.main()
