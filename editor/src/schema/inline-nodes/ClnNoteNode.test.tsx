import { describe, it, expect } from "vitest";
import { ClnNoteSpec } from "./ClnNoteNode";

describe("ClnNoteSpec — configuration", () => {
  it("has type 'clnNote'", () => {
    expect(ClnNoteSpec.config.type).toBe("clnNote");
  });

  it("uses styled content (native BlockNote nested inline content)", () => {
    expect(ClnNoteSpec.config.content).toBe("styled");
  });

  it("has empty propSchema (content lives in nested tree, not a prop)", () => {
    expect(Object.keys(ClnNoteSpec.config.propSchema)).toHaveLength(0);
  });
});
