import { useEffect } from "react";
import { convertMarkdownToCln } from "../lib/markdown-convert";

/**
 * Detects whether a plain-text string contains Markdown formatting
 * patterns that should be converted to ClearNotation syntax.
 */
function looksLikeMarkdown(text: string): boolean {
  return (
    /\*\*.+?\*\*/.test(text) ||
    /__.+?__/.test(text) ||
    /(?<!\+)\*[^*\n]+?\*/.test(text) ||
    /\[.+?\]\(.+?\)/.test(text)
  );
}

/**
 * Hook that intercepts paste events on a container element.
 * If plain text is pasted and contains Markdown patterns,
 * converts it to ClearNotation syntax before insertion.
 * If HTML is pasted, lets BlockNote handle it natively.
 */
export function useMarkdownPaste(
  containerRef: React.RefObject<HTMLElement | null>
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handlePaste = (e: ClipboardEvent) => {
      // If HTML content is present, let BlockNote handle it
      const html = e.clipboardData?.getData("text/html");
      if (html) return;

      const plain = e.clipboardData?.getData("text/plain");
      if (!plain) return;

      if (looksLikeMarkdown(plain)) {
        e.preventDefault();
        const converted = convertMarkdownToCln(plain);
        document.execCommand("insertText", false, converted);
      }
    };

    container.addEventListener("paste", handlePaste, { capture: true });
    return () => {
      container.removeEventListener("paste", handlePaste, { capture: true });
    };
  }, [containerRef]);
}
