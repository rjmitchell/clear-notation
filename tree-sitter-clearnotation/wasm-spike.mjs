import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const { Parser, Language } = await import('web-tree-sitter');
  await Parser.init();

  const parser = new Parser();
  const wasmPath = join(__dirname, 'tree-sitter-clearnotation.wasm');
  const Lang = await Language.load(wasmPath);
  parser.setLanguage(Lang);

  const fixturesDir = join(__dirname, '..', 'fixtures', 'valid');
  const fixtures = [
    'v01-minimal.cln', 'v02-meta-and-inline.cln', 'v03-link-and-note.cln',
    'v04-lists-and-blockquote.cln', 'v05-fenced-code.cln', 'v06-callout.cln',
    'v07-raw-blocks.cln', 'v08-anchor-and-ref.cln', 'v09-include.cln',
    'v10-escaped-openers.cln', 'v11-toc-and-slug-collision.cln', 'v12-figure.cln',
    'v13-source-directive.cln', 'v14-anchor-paragraph.cln', 'v15-table-escaped-pipe.cln',
  ];

  let passed = 0, failed = 0;

  for (const name of fixtures) {
    const source = readFileSync(join(fixturesDir, name), 'utf-8');
    const tree = parser.parse(source);
    const hasErrors = tree.rootNode.hasError;

    if (hasErrors) {
      console.log(`FAIL: ${name} — has ERROR nodes`);
      console.log(tree.rootNode.toString().slice(0, 200));
      failed++;
    } else {
      console.log(`PASS: ${name}`);
      passed++;
    }
    tree.delete();
  }

  console.log(`\n${passed} passed, ${failed} failed out of ${fixtures.length}`);

  // Body boundary verification
  const bodyChecks = ['v06-callout.cln', 'v07-raw-blocks.cln', 'v08-anchor-and-ref.cln'];
  console.log('\n--- Body boundary verification ---');
  for (const name of bodyChecks) {
    const source = readFileSync(join(fixturesDir, name), 'utf-8');
    const tree = parser.parse(source);
    console.log(`\n=== ${name} ===`);
    console.log(tree.rootNode.toString());
    tree.delete();
  }

  parser.delete();
}

main().catch(console.error);
