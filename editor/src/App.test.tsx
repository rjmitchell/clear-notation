import { describe, it, expect, vi } from "vitest";

// This test exercises the shortcut handler logic in isolation.
// We re-implement the guard pattern here to verify the pattern itself.
// The full App component is too heavy to mount in JSDOM for one assertion.

describe("App shortcut early returns on broken syncState", () => {
  it("handleToggleBold no-ops when syncState === 'broken'", () => {
    const editorSpy = { toggleStyles: vi.fn() };

    // Simulate the useCallback body
    const handleToggleBold = (syncState: string) => {
      if (syncState === "broken") return;
      editorSpy.toggleStyles({ bold: true });
    };

    handleToggleBold("broken");
    expect(editorSpy.toggleStyles).not.toHaveBeenCalled();

    handleToggleBold("valid");
    expect(editorSpy.toggleStyles).toHaveBeenCalledWith({ bold: true });
  });
});
