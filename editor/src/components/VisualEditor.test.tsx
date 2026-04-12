import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import VisualEditor from "./VisualEditor";

// BlockNote is heavy and non-essential for testing the prop wiring;
// we assert on the container class, not the BlockNote internals.
describe("VisualEditor — syncState dim + readOnly", () => {
  it("applies .visual-editor--stale class when syncState === 'broken'", () => {
    const { container } = render(
      <VisualEditor
        onDocumentChange={() => {}}
        syncState="broken"
      />
    );
    const wrapper = container.querySelector(".visual-editor");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.classList.contains("visual-editor--stale")).toBe(true);
  });

  it("does NOT apply .visual-editor--stale when syncState === 'valid'", () => {
    const { container } = render(
      <VisualEditor
        onDocumentChange={() => {}}
        syncState="valid"
      />
    );
    const wrapper = container.querySelector(".visual-editor");
    expect(wrapper?.classList.contains("visual-editor--stale")).toBe(false);
  });

  it("does NOT apply .visual-editor--stale when syncState === 'recovered'", () => {
    const { container } = render(
      <VisualEditor
        onDocumentChange={() => {}}
        syncState="recovered"
      />
    );
    const wrapper = container.querySelector(".visual-editor");
    expect(wrapper?.classList.contains("visual-editor--stale")).toBe(false);
  });
});
