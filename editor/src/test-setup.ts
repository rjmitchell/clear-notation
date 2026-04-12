import "@testing-library/react";
// Extend expect with React-testing-library matchers if needed in future.

// JSDOM doesn't implement window.matchMedia — shim it so Mantine (used by
// BlockNote's mantine theme) can mount in tests without throwing.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
