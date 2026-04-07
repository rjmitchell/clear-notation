import { describe, it, expect } from "vitest";
import {
  loadRegistry,
  getBlockDirectives,
  getInlineDirectives,
  getParsedModeDirectives,
  getRawModeDirectives,
  getNoneModeDirectives,
} from "./registry-types";

describe("loadRegistry", () => {
  it("loads the built-in registry JSON", () => {
    const registry = loadRegistry();
    expect(registry.spec).toBe("0.1");
    expect(registry.directives.length).toBe(9);
  });

  it("includes all expected directive names", () => {
    const registry = loadRegistry();
    const names = registry.directives.map((d) => d.name);
    expect(names).toContain("callout");
    expect(names).toContain("figure");
    expect(names).toContain("math");
    expect(names).toContain("table");
    expect(names).toContain("source");
    expect(names).toContain("toc");
    expect(names).toContain("anchor");
    expect(names).toContain("include");
    expect(names).toContain("ref");
  });
});

describe("getBlockDirectives", () => {
  it("returns only block-placement directives", () => {
    const directives = getBlockDirectives();
    expect(directives.length).toBe(8);
    for (const d of directives) {
      expect(d.placement).toBe("block");
    }
  });

  it("excludes inline directives", () => {
    const directives = getBlockDirectives();
    const names = directives.map((d) => d.name);
    expect(names).not.toContain("ref");
  });
});

describe("getInlineDirectives", () => {
  it("returns only inline-placement directives", () => {
    const directives = getInlineDirectives();
    expect(directives.length).toBe(1);
    expect(directives[0].name).toBe("ref");
  });
});

describe("getParsedModeDirectives", () => {
  it("returns callout and figure", () => {
    const directives = getParsedModeDirectives();
    const names = directives.map((d) => d.name);
    expect(names).toContain("callout");
    expect(names).toContain("figure");
    expect(names).toHaveLength(2);
  });
});

describe("getRawModeDirectives", () => {
  it("returns math, table, and source", () => {
    const directives = getRawModeDirectives();
    const names = directives.map((d) => d.name);
    expect(names).toContain("math");
    expect(names).toContain("table");
    expect(names).toContain("source");
    expect(names).toHaveLength(3);
  });
});

describe("getNoneModeDirectives", () => {
  it("returns toc, anchor, and include", () => {
    const directives = getNoneModeDirectives();
    const names = directives.map((d) => d.name);
    expect(names).toContain("toc");
    expect(names).toContain("anchor");
    expect(names).toContain("include");
    expect(names).toHaveLength(3);
  });
});

describe("directive attributes", () => {
  it("callout has kind (required), title (optional), compact (optional)", () => {
    const registry = loadRegistry();
    const callout = registry.directives.find((d) => d.name === "callout")!;
    expect(callout.attributes).toHaveLength(3);

    const kind = callout.attributes.find((a) => a.name === "kind")!;
    expect(kind.type).toBe("string");
    expect(kind.required).toBe(true);

    const title = callout.attributes.find((a) => a.name === "title")!;
    expect(title.required).toBe(false);

    const compact = callout.attributes.find((a) => a.name === "compact")!;
    expect(compact.type).toBe("boolean");
    expect(compact.required).toBe(false);
    expect(compact.default).toBe(false);
  });

  it("table has header and align attributes", () => {
    const registry = loadRegistry();
    const table = registry.directives.find((d) => d.name === "table")!;
    expect(table.attributes).toHaveLength(2);

    const align = table.attributes.find((a) => a.name === "align")!;
    expect(align.type).toBe("string[]");
    expect(align.allowed_values).toEqual(["left", "center", "right"]);
  });
});
