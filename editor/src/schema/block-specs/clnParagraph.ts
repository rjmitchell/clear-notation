/**
 * clnParagraphSpec — custom paragraph block spec that adds `anchorId`.
 *
 * Mirrors BlockNote's default paragraph spec (`createParagraphBlockSpec`)
 * from `@blocknote/core/src/blocks/Paragraph/block.ts`. The only functional
 * change is the addition of an optional `anchorId` prop.
 *
 * The runtime BlockNote block type stays `"paragraph"` so default keyboard
 * shortcuts (Mod-Alt-0) and HTML parse rules keep working unchanged.
 */

import {
  createBlockConfig,
  createBlockSpec,
  createExtension,
  defaultProps,
  parseDefaultProps,
  addDefaultPropsExternalHTML,
} from "@blocknote/core";

export const createClnParagraphBlockConfig = createBlockConfig(
  () =>
    ({
      type: "paragraph" as const,
      propSchema: {
        ...defaultProps,
        anchorId: { default: "" as string },
      },
      content: "inline" as const,
    }) as const,
);

const createClnParagraphBlockSpec = createBlockSpec(
  createClnParagraphBlockConfig,
  {
    meta: {
      isolating: false,
    },
    parse: (e) => {
      if (e.tagName !== "P") {
        return undefined;
      }

      // Edge case for things like images directly inside paragraph.
      if (!e.textContent?.trim()) {
        return undefined;
      }

      return parseDefaultProps(e);
    },
    render: () => {
      const dom = document.createElement("p");
      return {
        dom,
        contentDOM: dom,
      };
    },
    toExternalHTML: (block) => {
      const dom = document.createElement("p");
      addDefaultPropsExternalHTML(block.props, dom);
      return {
        dom,
        contentDOM: dom,
      };
    },
    runsBefore: ["default", "heading"],
  },
  [
    createExtension({
      key: "cln-paragraph-shortcuts",
      keyboardShortcuts: {
        "Mod-Alt-0": ({ editor }) => {
          const cursorPosition = editor.getTextCursorPosition();

          if (
            editor.schema.blockSchema[cursorPosition.block.type].content !==
            "inline"
          ) {
            return false;
          }

          editor.updateBlock(cursorPosition.block, {
            type: "paragraph",
            props: {},
          });
          return true;
        },
      },
    }),
  ],
);

export const clnParagraphSpec = createClnParagraphBlockSpec();
