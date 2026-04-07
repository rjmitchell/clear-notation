import { describe, it, expect } from "vitest";
import type { CSTNode, ParseResult, WorkerRequest, WorkerResponse } from "./types";

describe("CSTNode type", () => {
  it("represents a minimal document node", () => {
    const node: CSTNode = {
      type: "document",
      text: "# Hello\n",
      startIndex: 0,
      endIndex: 9,
      startPosition: { row: 0, column: 0 },
      endPosition: { row: 1, column: 0 },
      isNamed: true,
      hasError: false,
      children: [],
      fieldName: null,
    };

    expect(node.type).toBe("document");
    expect(node.hasError).toBe(false);
    expect(node.children).toHaveLength(0);
  });

  it("represents nested nodes", () => {
    const heading: CSTNode = {
      type: "heading",
      text: "# Hello\n",
      startIndex: 0,
      endIndex: 9,
      startPosition: { row: 0, column: 0 },
      endPosition: { row: 0, column: 9 },
      isNamed: true,
      hasError: false,
      children: [
        {
          type: "heading_marker",
          text: "#",
          startIndex: 0,
          endIndex: 1,
          startPosition: { row: 0, column: 0 },
          endPosition: { row: 0, column: 1 },
          isNamed: true,
          hasError: false,
          children: [],
          fieldName: null,
        },
        {
          type: "inline_content",
          text: "Hello",
          startIndex: 2,
          endIndex: 7,
          startPosition: { row: 0, column: 2 },
          endPosition: { row: 0, column: 7 },
          isNamed: true,
          hasError: false,
          children: [
            {
              type: "text",
              text: "Hello",
              startIndex: 2,
              endIndex: 7,
              startPosition: { row: 0, column: 2 },
              endPosition: { row: 0, column: 7 },
              isNamed: true,
              hasError: false,
              children: [],
              fieldName: null,
            },
          ],
          fieldName: null,
        },
      ],
      fieldName: null,
    };

    expect(heading.children).toHaveLength(2);
    expect(heading.children[0].type).toBe("heading_marker");
    expect(heading.children[1].type).toBe("inline_content");
    expect(heading.children[1].children[0].text).toBe("Hello");
  });

  it("represents error nodes", () => {
    const errorNode: CSTNode = {
      type: "document",
      text: "::unknown{\nbad\n",
      startIndex: 0,
      endIndex: 15,
      startPosition: { row: 0, column: 0 },
      endPosition: { row: 2, column: 0 },
      isNamed: true,
      hasError: true,
      children: [],
      fieldName: null,
    };

    expect(errorNode.hasError).toBe(true);
  });
});

describe("ParseResult type", () => {
  it("contains tree and timing", () => {
    const result: ParseResult = {
      tree: {
        type: "document",
        text: "",
        startIndex: 0,
        endIndex: 0,
        startPosition: { row: 0, column: 0 },
        endPosition: { row: 0, column: 0 },
        isNamed: true,
        hasError: false,
        children: [],
        fieldName: null,
      },
      parseTimeMs: 1.5,
    };

    expect(result.parseTimeMs).toBe(1.5);
    expect(result.tree.type).toBe("document");
  });
});

describe("WorkerRequest discriminated union", () => {
  it("has init variant", () => {
    const msg: WorkerRequest = { type: "init", wasmUrl: "/parser.wasm" };
    expect(msg.type).toBe("init");
  });

  it("has parse variant", () => {
    const msg: WorkerRequest = { type: "parse", id: 1, source: "# Hi\n" };
    expect(msg.type).toBe("parse");
    expect(msg.id).toBe(1);
  });
});

describe("WorkerResponse discriminated union", () => {
  it("has init-ok variant", () => {
    const msg: WorkerResponse = { type: "init-ok" };
    expect(msg.type).toBe("init-ok");
  });

  it("has init-error variant", () => {
    const msg: WorkerResponse = { type: "init-error", error: "WASM failed" };
    expect(msg.type).toBe("init-error");
  });

  it("has parse-ok variant", () => {
    const msg: WorkerResponse = {
      type: "parse-ok",
      id: 1,
      result: {
        tree: {
          type: "document",
          text: "",
          startIndex: 0,
          endIndex: 0,
          startPosition: { row: 0, column: 0 },
          endPosition: { row: 0, column: 0 },
          isNamed: true,
          hasError: false,
          children: [],
          fieldName: null,
        },
        parseTimeMs: 0.5,
      },
    };
    expect(msg.id).toBe(1);
  });

  it("has parse-error variant", () => {
    const msg: WorkerResponse = {
      type: "parse-error",
      id: 2,
      error: "Parse failed",
    };
    expect(msg.id).toBe(2);
    expect(msg.error).toBe("Parse failed");
  });
});
