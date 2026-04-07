import { describe, it, expect } from "vitest";
import {
  buildDirectiveBlockSpec,
  buildAllDirectiveBlockSpecs,
  DIRECTIVE_BLOCK_SPECS,
} from "./directive-blocks";
import type { RegistryDirective } from "./registry-types";

describe("buildDirectiveBlockSpec", () => {
  it("maps parsed-mode directive to inline content block", () => {
    const directive: RegistryDirective = {
      name: "callout",
      placement: "block",
      body_mode: "parsed",
      emits: ["callout"],
      built_in: true,
      attributes: [
        { name: "kind", type: "string", required: true },
        { name: "title", type: "string", required: false },
        { name: "compact", type: "boolean", required: false, default: false },
      ],
    };

    const spec = buildDirectiveBlockSpec(directive);
    expect(spec.type).toBe("clnCallout");
    expect(spec.content).toBe("inline");
    expect(spec.propSchema.kind.type).toBe("string");
    expect(spec.propSchema.kind.default).toBe("");
    expect(spec.propSchema.title.type).toBe("string");
    expect(spec.propSchema.title.default).toBe("");
    expect(spec.propSchema.compact.type).toBe("boolean");
    expect(spec.propSchema.compact.default).toBe(false);
    expect(spec.directiveName).toBe("callout");
    expect(spec.bodyMode).toBe("parsed");
  });

  it("maps raw-mode directive (non-table) to none content block", () => {
    const directive: RegistryDirective = {
      name: "math",
      placement: "block",
      body_mode: "raw",
      emits: ["math"],
      built_in: true,
      attributes: [],
    };

    const spec = buildDirectiveBlockSpec(directive);
    expect(spec.type).toBe("clnMath");
    expect(spec.content).toBe("none");
    expect(spec.propSchema.rawContent.type).toBe("string");
    expect(spec.propSchema.rawContent.default).toBe("");
    expect(spec.bodyMode).toBe("raw");
  });

  it("maps table directive to table content block", () => {
    const directive: RegistryDirective = {
      name: "table",
      placement: "block",
      body_mode: "raw",
      emits: ["table"],
      built_in: true,
      attributes: [
        { name: "header", type: "boolean", required: false, default: false },
        { name: "align", type: "string[]", required: false, allowed_values: ["left", "center", "right"] },
      ],
    };

    const spec = buildDirectiveBlockSpec(directive);
    expect(spec.type).toBe("clnTable");
    expect(spec.content).toBe("table");
    expect(spec.propSchema.header.type).toBe("boolean");
    expect(spec.propSchema.header.default).toBe(false);
    expect(spec.propSchema.tableData.type).toBe("string");
    expect(spec.propSchema.tableData.default).toBe("[]");
    expect(spec.bodyMode).toBe("raw");
  });

  it("maps none-mode directive to void block", () => {
    const directive: RegistryDirective = {
      name: "toc",
      placement: "block",
      body_mode: "none",
      emits: ["toc"],
      built_in: true,
      attributes: [],
    };

    const spec = buildDirectiveBlockSpec(directive);
    expect(spec.type).toBe("clnToc");
    expect(spec.content).toBe("none");
    expect(spec.bodyMode).toBe("none");
  });

  it("maps anchor with id attribute", () => {
    const directive: RegistryDirective = {
      name: "anchor",
      placement: "block",
      body_mode: "none",
      emits: ["anchor"],
      built_in: true,
      attributes: [
        { name: "id", type: "string", required: true },
      ],
    };

    const spec = buildDirectiveBlockSpec(directive);
    expect(spec.type).toBe("clnAnchor");
    expect(spec.propSchema.id.type).toBe("string");
    expect(spec.propSchema.id.default).toBe("");
  });

  it("maps source directive with language attribute and rawContent", () => {
    const directive: RegistryDirective = {
      name: "source",
      placement: "block",
      body_mode: "raw",
      emits: ["source"],
      built_in: true,
      attributes: [
        { name: "language", type: "string", required: true },
      ],
    };

    const spec = buildDirectiveBlockSpec(directive);
    expect(spec.type).toBe("clnSource");
    expect(spec.propSchema.language.type).toBe("string");
    expect(spec.propSchema.language.default).toBe("");
    expect(spec.propSchema.rawContent.type).toBe("string");
    expect(spec.content).toBe("none");
  });

  it("maps figure directive as parsed-mode block", () => {
    const directive: RegistryDirective = {
      name: "figure",
      placement: "block",
      body_mode: "parsed",
      emits: ["figure"],
      built_in: true,
      attributes: [
        { name: "src", type: "string", required: true },
      ],
    };

    const spec = buildDirectiveBlockSpec(directive);
    expect(spec.type).toBe("clnFigure");
    expect(spec.content).toBe("inline");
    expect(spec.propSchema.src.type).toBe("string");
  });
});

describe("buildAllDirectiveBlockSpecs", () => {
  it("builds specs for all block directives", () => {
    const specs = buildAllDirectiveBlockSpecs();
    const types = Object.keys(specs);

    // 8 block directives (ref is inline, excluded)
    expect(types).toHaveLength(8);
    expect(types).toContain("clnCallout");
    expect(types).toContain("clnFigure");
    expect(types).toContain("clnMath");
    expect(types).toContain("clnTable");
    expect(types).toContain("clnSource");
    expect(types).toContain("clnToc");
    expect(types).toContain("clnAnchor");
    expect(types).toContain("clnInclude");
  });

  it("excludes inline directives", () => {
    const specs = buildAllDirectiveBlockSpecs();
    const types = Object.keys(specs);
    expect(types).not.toContain("clnRef");
  });
});

describe("DIRECTIVE_BLOCK_SPECS constant", () => {
  it("is pre-built from the registry", () => {
    expect(Object.keys(DIRECTIVE_BLOCK_SPECS)).toHaveLength(8);
  });
});
