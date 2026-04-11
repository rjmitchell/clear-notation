/**
 * clnBulletListItemSpec — custom bullet list item block spec that adds
 * `anchorId`.
 *
 * Mirrors BlockNote's default bullet list item spec
 * (`createBulletListItemBlockSpec`) from
 * `@blocknote/core/src/blocks/ListItem/BulletListItem/block.ts`. The only
 * functional change is the addition of an optional `anchorId` prop.
 *
 * The runtime BlockNote block type stays `"bulletListItem"`.
 *
 * NOTE on the Enter handler: BlockNote's default wires an `Enter` keyboard
 * shortcut to its internal `handleEnter` helper, which depends on
 * `splitBlockTr` / `updateBlockTr` — neither of which `@blocknote/core`
 * exports publicly. Re-implementing them here would mean copying ~200 lines
 * of internal block-manipulation logic into our codebase. We instead omit
 * the Enter handler from the spec; ProseMirror's default Enter behavior
 * still works (creating a new list item), and the "Enter on empty list item
 * exits the list" UX will need to come from a follow-up if we replace the
 * default spec at runtime in Task 11.
 *
 * Mod-Shift-8 (toggle bullet list) and the `-`/`+`/`*` markdown input rule
 * are independent of internal helpers, so they ARE preserved.
 *
 * NOTE on `parseContent`: BlockNote's default uses an unexported helper
 * (`getListItemContent`) to flatten multi-paragraph `<li>` HTML when pasting
 * external HTML. We omit `parseContent` and fall back to BlockNote's default
 * inline content parsing. Pasting from external HTML lists will still work
 * for the common case (single paragraph per `<li>`); rich nested HTML pastes
 * may differ from upstream behavior. CLN's primary paste path is markdown,
 * which goes through a separate hook in `useMarkdownPaste`.
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

export const createClnBulletListItemBlockConfig = createBlockConfig(
  () =>
    ({
      type: "bulletListItem" as const,
      propSchema: {
        ...defaultProps,
        anchorId: { default: "" as string },
      },
      content: "inline",
    }) as const,
);

const createClnBulletListItemBlockSpec = createBlockSpec(
  createClnBulletListItemBlockConfig,
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
        parent.tagName === "UL" ||
        (parent.tagName === "DIV" && parent.parentElement?.tagName === "UL")
      ) {
        return parseDefaultProps(element);
      }

      return undefined;
    },
    render() {
      // We use a <p> tag, because for <li> tags we'd need a <ul> element to
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
      key: "cln-bullet-list-item-shortcuts",
      keyboardShortcuts: {
        "Mod-Shift-8": ({ editor }) => {
          const cursorPosition = editor.getTextCursorPosition();

          if (
            editor.schema.blockSchema[cursorPosition.block.type].content !==
            "inline"
          ) {
            return false;
          }

          editor.updateBlock(cursorPosition.block, {
            type: "bulletListItem",
            props: {},
          });
          return true;
        },
      },
      inputRules: [
        {
          find: /^\s?[-+*]\s$/,
          replace({ editor }) {
            const blockInfo = getBlockInfoFromSelection(
              editor.prosemirrorState,
            );

            if (blockInfo.blockNoteType === "heading") {
              return;
            }
            return {
              type: "bulletListItem",
              props: {},
            };
          },
        },
      ],
    }),
  ],
);

export const clnBulletListItemSpec = createClnBulletListItemBlockSpec();
