/**
 * clnSource — directive-based code block.
 *
 * Source form: ::source[language="python"]{
 *   def hello(): pass
 * }
 *
 * Functionally equivalent to fenced code blocks (```lang ... ```) but
 * uses directive syntax.
 */

import { createBlockConfig, createBlockSpec } from "@blocknote/core";

const createClnSourceBlockConfig = createBlockConfig(() => ({
  type: "clnSource" as const,
  propSchema: {
    language: { default: "" as string },
    rawContent: { default: "" as string },
  },
  content: "none" as const,
}));

const createClnSourceBlockSpec = createBlockSpec(
  createClnSourceBlockConfig,
  () => ({
    render(block) {
      const language = block.props.language as string;
      const code = block.props.rawContent as string;

      const container = document.createElement("div");
      container.className = "cln-source";
      container.contentEditable = "false";
      Object.assign(container.style, {
        margin: "4px 0",
        borderRadius: "var(--cn-radius-sm, 4px)",
        overflow: "hidden",
        border: "1px solid var(--cn-border)",
      });

      if (language) {
        const langLabel = document.createElement("div");
        Object.assign(langLabel.style, {
          padding: "2px 12px",
          fontSize: "0.75em",
          color: "var(--cn-muted)",
          background: "var(--cn-surface)",
          borderBottom: "1px solid var(--cn-border)",
          fontFamily: "var(--cn-font-mono, monospace)",
        });
        langLabel.textContent = language;
        container.appendChild(langLabel);
      }

      const pre = document.createElement("pre");
      Object.assign(pre.style, {
        margin: "0",
        padding: "12px 16px",
        background: "var(--cn-code-bg)",
        fontFamily: "var(--cn-font-mono, 'Geist Mono', monospace)",
        fontSize: "0.85em",
        lineHeight: "1.5",
        overflow: "auto",
        whiteSpace: "pre-wrap",
      });
      const codeEl = document.createElement("code");
      codeEl.textContent = code;
      pre.appendChild(codeEl);
      container.appendChild(pre);

      return { dom: container };
    },
  }),
);

export const clnSourceSpec = createClnSourceBlockSpec();
