import { describe, it, expect } from "vitest";
import { ClnRefSpec } from "./ClnRefNode";

describe("ClnRefSpec — configuration", () => {
  it("has type 'clnRef'", () => {
    expect(ClnRefSpec.config.type).toBe("clnRef");
  });

  it("is atomic (content: 'none')", () => {
    expect(ClnRefSpec.config.content).toBe("none");
  });

  it("declares a target string prop", () => {
    expect(ClnRefSpec.config.propSchema).toHaveProperty("target");
    expect(ClnRefSpec.config.propSchema.target.default).toBe("");
  });
});
