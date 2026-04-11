/**
 * Web Worker that loads tree-sitter WASM and provides off-main-thread parsing.
 */

import type { WorkerRequest, WorkerResponse, CSTNode } from "./types";

type TreeSitterParser = any;
type SyntaxNode = any;

let parser: TreeSitterParser | null = null;

function post(msg: WorkerResponse): void {
  self.postMessage(msg);
}

/**
 * Recursively convert a tree-sitter SyntaxNode to a serializable CSTNode.
 * Only includes named children to keep the payload lean.
 */
function serializeNode(node: SyntaxNode): CSTNode {
  const children: CSTNode[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) {
      children.push(serializeNode(child));
    }
  }

  return {
    type: node.type,
    text: node.text,
    startIndex: node.startIndex,
    endIndex: node.endIndex,
    startPosition: {
      row: node.startPosition.row,
      column: node.startPosition.column,
    },
    endPosition: {
      row: node.endPosition.row,
      column: node.endPosition.column,
    },
    isNamed: node.isNamed,
    hasError: node.hasError,
    children,
    fieldName: null,
  };
}

async function handleInit(wasmUrl: string): Promise<void> {
  try {
    // web-tree-sitter 0.26.x uses named exports — there is no default export.
    // Previously this file imported `.default`, which was always undefined and
    // caused init to throw with "Cannot read properties of undefined (reading 'init')".
    const { Parser, Language } = await import("web-tree-sitter");
    await Parser.init({
      locateFile: (path: string) => {
        // Serve tree-sitter engine WASM from the public directory.
        // Use Vite's BASE_URL so this works under any deploy base
        // (dev + GH Pages + any prod base path).
        if (path.endsWith(".wasm")) {
          return `${import.meta.env.BASE_URL}tree-sitter.wasm`;
        }
        return path;
      },
    });

    parser = new Parser();

    const response = await fetch(wasmUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch WASM: ${response.status} ${response.statusText}`
      );
    }
    const wasmBuffer = await response.arrayBuffer();
    const lang = await Language.load(new Uint8Array(wasmBuffer));
    parser.setLanguage(lang);

    post({ type: "init-ok" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: "init-error", error: message });
  }
}

function handleParse(id: number, source: string): void {
  if (!parser) {
    post({ type: "parse-error", id, error: "Parser not initialized" });
    return;
  }

  try {
    const start = performance.now();
    const tree = parser.parse(source);
    const parseTimeMs = performance.now() - start;

    const serialized = serializeNode(tree.rootNode);
    tree.delete();

    post({
      type: "parse-ok",
      id,
      result: { tree: serialized, parseTimeMs },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: "parse-error", id, error: message });
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init":
      handleInit(msg.wasmUrl);
      break;
    case "parse":
      handleParse(msg.id, msg.source);
      break;
  }
};
