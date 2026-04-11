import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import SourcePane from "./SourcePane";

describe("SourcePane — error state UX", () => {
  it("does NOT render the old yellow banner in broken state", () => {
    const { container } = render(
      <SourcePane
        source=""
        onSourceChange={() => {}}
        syncState="broken"
      />
    );
    expect(container.querySelector(".source-error-bar")).toBeNull();
  });

  it("renders a gutter marker when syncState === 'broken'", async () => {
    const { container } = render(
      <SourcePane
        source="foo"
        onSourceChange={() => {}}
        syncState="broken"
      />
    );
    // CodeMirror renders gutters asynchronously; wait for the marker to appear
    await waitFor(() => {
      const marker = container.querySelector(".cn-source-error-gutter");
      expect(marker).not.toBeNull();
    });
  });

  it("does NOT render gutter marker when syncState === 'valid'", () => {
    const { container } = render(
      <SourcePane
        source="foo\n"
        onSourceChange={() => {}}
        syncState="valid"
      />
    );
    expect(container.querySelector(".cn-source-error-gutter")).toBeNull();
  });

  it("aria-live region announces on broken state", async () => {
    const { container, rerender } = render(
      <SourcePane
        source=""
        onSourceChange={() => {}}
        syncState="valid"
      />
    );
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();

    rerender(
      <SourcePane
        source=""
        onSourceChange={() => {}}
        syncState="broken"
      />
    );
    await waitFor(() => {
      expect(liveRegion?.textContent).toBe(
        "Source has a syntax error. Visual editor is read-only."
      );
    });
  });

  it("aria-live region is silent on recovered state", () => {
    const { container } = render(
      <SourcePane
        source="+{bold}"
        onSourceChange={() => {}}
        syncState="recovered"
      />
    );
    const liveRegion = container.querySelector('[aria-live="polite"]');
    // "recovered" is silent — the live region exists but has empty content
    expect(liveRegion?.textContent).toBe("");
  });

  it("aria-live region is silent on initial mount even when syncState === 'valid'", () => {
    const { container } = render(
      <SourcePane source="" onSourceChange={() => {}} syncState="valid" />
    );
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent).toBe("");
  });

  it("aria-live region is silent on initial mount when syncState === 'broken'", () => {
    const { container } = render(
      <SourcePane source="" onSourceChange={() => {}} syncState="broken" />
    );
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent).toBe("");
  });
});
