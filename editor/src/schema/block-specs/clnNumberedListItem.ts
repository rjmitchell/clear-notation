/**
 * clnNumberedListItemSpec — custom numbered list item block spec.
 *
 * Mirrors BlockNote's default numbered list item spec
 * (`createNumberedListItemBlockSpec`) from
 * `@blocknote/core/src/blocks/ListItem/NumberedListItem/block.ts` with TWO
 * deliberate changes:
 *
 * 1. Adds an optional `anchorId` prop on the propSchema.
 * 2. Renames the `start` prop to `startNumber`. The CLN converter and
 *    serializer (e.g. `VisualEditor.tsx:93`, `bn-to-blocknote.ts:79`)
 *    already read `block.props.startNumber` — they were silently reading
 *    `undefined` because BlockNote's default spec uses the name `start`.
 *    With this rename, those existing consumers start receiving real data.
 *    No further rename cascade is needed.
 *
 * The runtime BlockNote block type stays `"numberedListItem"`.
 *
 * NOTE on the Enter handler: same caveat as `clnBulletListItem.ts` — we omit
 * the Enter handler because BlockNote's `handleEnter` helper depends on
 * unexported internals. Mod-Shift-7 (toggle numbered list) and the `\d+. `
 * markdown input rule are preserved.
 *
 * NOTE on `NumberedListIndexingDecorationPlugin`: BlockNote's default ships
 * a ProseMirror plugin that walks numbered list items and applies CSS
 * `data-index` decorations for display. That plugin is not exported from
 * `@blocknote/core` and reads `node.firstChild.attrs["start"]` directly,
 * which would no longer match our renamed `startNumber` prop anyway. We
 * omit it; CLN's HTML render path computes display indices independently.
 *
 * NOTE on `parseContent`: same caveat as `clnBulletListItem.ts` — we omit
 * the custom `parseContent` and let BlockNote's default inline content
 * parsing run. CLN's primary paste path is markdown via `useMarkdownPaste`.
 */

import {
  createBlockConfig,
  createBlockSpec,
  createExtension,
  defaultProps,
  parseDefaultProps,
  addDefaultPropsExternalHTML,
  getBlockInfoFromSelection,
} from "@blocknote/core";

export const createClnNumberedListItemBlockConfig = createBlockConfig(
  () =>
    ({
      type: "numberedListItem" as const,
      propSchema: {
        ...defaultProps,
        // CLN-side prop name, replaces BlockNote's `start`. Stored as
        // optional number; consumers read it as `block.props.startNumber`.
        startNumber: {
          default: undefined as number | undefined,
          type: "number",
        } as const,
        anchorId: { default: "" as string },
      },
      content: "inline",
    }) as const,
);

const createClnNumberedListItemBlockSpec = createBlockSpec(
  createClnNumberedListItemBlockConfig,
  {
    meta: {
      isolating: false,
    },
    parse(element) {
      if (element.tagName !== "LI") {
        return undefined;
      }

      const parent = element.parentElement;

      if (parent === null) {
        return undefined;
      }

      if (
        parent.tagName === "OL" ||
        (parent.tagName === "DIV" && parent.parentElement?.tagName === "OL")
      ) {
        const startIndex = parseInt(parent.getAttribute("start") || "1");

        const props = parseDefaultProps(element);

        if (element.previousElementSibling || startIndex === 1) {
          return props;
        }

        return {
          ...props,
          // Use our renamed prop, not BlockNote's `start`.
          startNumber: startIndex,
        };
      }

      return undefined;
    },
    render() {
      // We use a <p> tag, because for <li> tags we'd need a <ol> element to
      // put them in to be semantically correct, which we can't have due to
      // the schema.
      const dom = document.createElement("p");

      return {
        dom,
        contentDOM: dom,
      };
    },
    toExternalHTML(block) {
      const li = document.createElement("li");
      const p = document.createElement("p");
      addDefaultPropsExternalHTML(block.props, li);
      li.appendChild(p);

      return {
        dom: li,
        contentDOM: p,
      };
    },
  },
  [
    createExtension({
      key: "cln-numbered-list-item-shortcuts",
      inputRules: [
        {
          find: /^\s?(\d+)\.\s$/,
          replace({ match, editor }) {
            const blockInfo = getBlockInfoFromSelection(
              editor.prosemirrorState,
            );

            if (blockInfo.blockNoteType === "heading") {
              return;
            }
            const start = parseInt(match[1]);
            return {
              type: "numberedListItem",
              props: {
                startNumber: start !== 1 ? start : undefined,
              },
            };
          },
        },
      ],
      keyboardShortcuts: {
        "Mod-Shift-7": ({ editor }) => {
          const cursorPosition = editor.getTextCursorPosition();

          if (
            editor.schema.blockSchema[cursorPosition.block.type].content !==
            "inline"
          ) {
            return false;
          }

          editor.updateBlock(cursorPosition.block, {
            type: "numberedListItem",
            props: {},
          });
          return true;
        },
      },
    }),
  ],
);

export const clnNumberedListItemSpec = createClnNumberedListItemBlockSpec();
