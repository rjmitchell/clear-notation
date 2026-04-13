/**
 * clnFigure — figure block with image and caption.
 *
 * Source form: ::figure[src="images/arch.svg"]{
 *   Caption text describing the figure.
 * }
 *
 * Renders a <figure> with the src path displayed and caption text.
 * Actual image loading is deferred until image management is implemented.
 */

import { createBlockConfig, createBlockSpec } from "@blocknote/core";

const createClnFigureBlockConfig = createBlockConfig(() => ({
  type: "clnFigure" as const,
  propSchema: {
    src: { default: "" as string },
    rawContent: { default: "" as string },
  },
  content: "none" as const,
}));

const createClnFigureBlockSpec = createBlockSpec(
  createClnFigureBlockConfig,
  () => ({
    render(block) {
      const figure = document.createElement("figure");
      figure.className = "cln-figure";
      figure.contentEditable = "false";
      Object.assign(figure.style, {
        margin: "8px 0",
        padding: "12px",
        border: "1px dashed var(--cn-border)",
        borderRadius: "var(--cn-radius-sm, 4px)",
        textAlign: "center",
      });

      const src = block.props.src as string;
      const caption = block.props.rawContent as string;

      if (src) {
        const srcLabel = document.createElement("div");
        Object.assign(srcLabel.style, {
          padding: "16px",
          color: "var(--cn-muted)",
          fontSize: "0.85em",
        });
        const mono = document.createElement("span");
        mono.style.fontFamily = "var(--cn-font-mono, monospace)";
        mono.textContent = src;
        srcLabel.appendChild(mono);
        figure.appendChild(srcLabel);
      } else {
        const placeholder = document.createElement("div");
        Object.assign(placeholder.style, { padding: "16px", color: "var(--cn-muted)" });
        placeholder.textContent = "No image source";
        figure.appendChild(placeholder);
      }

      if (caption) {
        const figcaption = document.createElement("figcaption");
        Object.assign(figcaption.style, {
          color: "var(--cn-muted)",
          fontSize: "0.85em",
          marginTop: "4px",
          fontStyle: "italic",
        });
        figcaption.textContent = caption;
        figure.appendChild(figcaption);
      }

      return { dom: figure };
    },
  }),
);

export const clnFigureSpec = createClnFigureBlockSpec();
