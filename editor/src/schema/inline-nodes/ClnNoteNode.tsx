/**
 * ClnNoteNode — inline footnote with native BlockNote styled content.
 *
 * Source form: ^{footnote content with +{bold} and ::ref[target="intro"]}
 * Visual form:
 *   - Always: <sup class="cln-note-marker">[{nested content}]</sup>
 *
 * Content: "styled" — the footnote's inline content lives in BlockNote's
 * native nested inline content tree. clnRef nested inside clnNote is
 * supported because content: "styled" maps to ProseMirror's "inline*"
 * which accepts any inline content including custom inline content nodes
 * (verified during eng review at ReactInlineContentSpec.tsx:125-127).
 *
 * Empty propSchema — all state is in the nested content tree.
 *
 * Numbering: placeholder [n] wrapper is used during editing. Real ordinals
 * are assigned at HTML render time, not in the editor. Phase A scope.
 */

import { createReactInlineContentSpec } from "@blocknote/react";
import React from "react";

export const ClnNoteSpec = createReactInlineContentSpec(
  {
    type: "clnNote" as const,
    propSchema: {},
    content: "styled" as const,
  },
  {
    render: (props) => {
      // With content: "styled", BlockNote renders the nested inline content
      // inside the element attached via contentRef. The React view is the
      // "chrome" around that content — a styled superscript wrapper.
      return (
        <sup
          className="cln-note-marker"
          style={{
            color: "var(--cn-muted)",
            padding: "0 2px",
            borderRadius: "var(--cn-radius-sm, 4px)",
          }}
        >
          [
          <span
            ref={props.contentRef}
            style={{
              fontSize: "inherit",
              fontFamily: "var(--cn-font-body, system-ui)",
            }}
          />
          ]
        </sup>
      );
    },
  },
);
