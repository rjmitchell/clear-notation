/**
 * clnMath — block-level math display.
 *
 * Source form: ::math{
 *   E = mc^2
 * }
 *
 * Renders the raw LaTeX/math content in a styled block. KaTeX rendering
 * is deferred to a future version; v1.0 preserves the raw text in a
 * visually distinct math block.
 */

import { createBlockConfig, createBlockSpec } from "@blocknote/core";

const createClnMathBlockConfig = createBlockConfig(() => ({
  type: "clnMath" as const,
  propSchema: {
    rawContent: { default: "" as string },
  },
  content: "none" as const,
}));

const createClnMathBlockSpec = createBlockSpec(
  createClnMathBlockConfig,
  () => ({
    render(block) {
      const dom = document.createElement("div");
      dom.className = "cln-math";
      dom.contentEditable = "false";
      Object.assign(dom.style, {
        fontFamily: "var(--cn-font-mono, 'Geist Mono', monospace)",
        fontSize: "0.95em",
        padding: "12px 16px",
        margin: "4px 0",
        background: "var(--cn-code-bg)",
        borderRadius: "var(--cn-radius-sm, 4px)",
        border: "1px solid var(--cn-border)",
        textAlign: "center",
        whiteSpace: "pre-wrap",
        letterSpacing: "0.02em",
      });

      const label = document.createElement("span");
      Object.assign(label.style, {
        color: "var(--cn-muted)",
        fontSize: "0.75em",
        marginRight: "8px",
      });
      label.textContent = "math";
      dom.appendChild(label);

      const content = document.createTextNode(block.props.rawContent as string);
      dom.appendChild(content);

      return { dom };
    },
  }),
);

export const clnMathSpec = createClnMathBlockSpec();
