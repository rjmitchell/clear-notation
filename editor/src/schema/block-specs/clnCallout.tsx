/**
 * clnCallout — styled callout/admonition block.
 *
 * Source form: ::callout[kind="info", title="Note"]{
 *   Body content here.
 * }
 *
 * Renders a styled box with a colored left border based on kind.
 */

import { createBlockConfig, createBlockSpec } from "@blocknote/core";

const KIND_COLORS: Record<string, string> = {
  info: "var(--cn-accent)",
  warning: "#d97706",
  tip: "#059669",
  note: "var(--cn-accent)",
  danger: "#dc2626",
};

const KIND_ICONS: Record<string, string> = {
  info: "\u2139",     // ℹ
  warning: "\u26A0",  // ⚠
  tip: "\uD83D\uDCA1", // 💡
  note: "\uD83D\uDCDD", // 📝
  danger: "\uD83D\uDEA8", // 🚨
};

const createClnCalloutBlockConfig = createBlockConfig(() => ({
  type: "clnCallout" as const,
  propSchema: {
    kind: { default: "info" as string },
    title: { default: "" as string },
    compact: { default: false },
    rawContent: { default: "" as string },
  },
  content: "none" as const,
}));

const createClnCalloutBlockSpec = createBlockSpec(
  createClnCalloutBlockConfig,
  () => ({
    render(block) {
      const kind = block.props.kind as string;
      const borderColor = KIND_COLORS[kind] || KIND_COLORS.info;

      const dom = document.createElement("div");
      dom.className = `cln-callout cln-callout--${kind}`;
      dom.contentEditable = "false";
      Object.assign(dom.style, {
        margin: "4px 0",
        padding: "10px 14px",
        borderLeft: `3px solid ${borderColor}`,
        background: "var(--cn-surface)",
        borderRadius: "var(--cn-radius-sm, 4px)",
        fontSize: "0.9em",
      });

      const title = block.props.title as string;
      const icon = KIND_ICONS[kind] || KIND_ICONS.info;

      if (title) {
        const titleDiv = document.createElement("div");
        Object.assign(titleDiv.style, {
          fontWeight: "600",
          marginBottom: "4px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        });
        const iconSpan = document.createElement("span");
        iconSpan.textContent = icon;
        titleDiv.appendChild(iconSpan);
        titleDiv.appendChild(document.createTextNode(title));
        dom.appendChild(titleDiv);
      } else {
        const iconSpan = document.createElement("span");
        iconSpan.style.marginRight = "6px";
        iconSpan.textContent = icon;
        dom.appendChild(iconSpan);
      }

      const rawContent = block.props.rawContent as string;
      if (rawContent) {
        const bodyDiv = document.createElement("div");
        bodyDiv.style.whiteSpace = "pre-wrap";
        bodyDiv.textContent = rawContent;
        dom.appendChild(bodyDiv);
      }

      return { dom };
    },
  }),
);

export const clnCalloutSpec = createClnCalloutBlockSpec();
