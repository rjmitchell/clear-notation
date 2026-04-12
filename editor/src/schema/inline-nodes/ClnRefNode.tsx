/**
 * ClnRefNode — atomic cross-reference pill.
 *
 * Source form: ::ref[target="intro"]
 * Visual form: <span class="cln-ref-pill">#intro</span>
 *
 * Content: "none" — the pill is atomic. The target string is held as a prop,
 * not as inline content. To change the target, the user drops to the source
 * pane. Authoring UI (ref picker) is Phase B.
 */

import { createReactInlineContentSpec } from "@blocknote/react";
import React from "react";

export const ClnRefSpec = createReactInlineContentSpec(
  {
    type: "clnRef" as const,
    propSchema: {
      target: { default: "" as string },
    },
    content: "none" as const,
  },
  {
    render: (props) => {
      const target = props.inlineContent.props.target;
      return (
        <span
          className="cln-ref-pill"
          contentEditable={false}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            background: "color-mix(in srgb, var(--cn-accent) 12%, var(--cn-bg))",
            border: "1px solid color-mix(in srgb, var(--cn-accent) 25%, transparent)",
            color: "var(--cn-accent)",
            padding: "1px 6px",
            borderRadius: "var(--cn-radius-sm, 4px)",
            fontSize: "0.9em",
            fontFamily: "var(--cn-font-ui, system-ui)",
            fontWeight: 500,
            verticalAlign: "baseline",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: "0.7em" }}>
            #
          </span>
          {target}
        </span>
      );
    },
  },
);
