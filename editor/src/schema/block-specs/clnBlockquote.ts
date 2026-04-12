/**
 * clnBlockquoteSpec — custom quote block spec that adds `anchorId`.
 *
 * Mirrors BlockNote's default quote spec (`createQuoteBlockSpec`) from
 * `@blocknote/core/src/blocks/Quote/block.ts`. The only functional change
 * is the addition of an optional `anchorId` prop.
 *
 * The runtime BlockNote block type stays `"quote"` (upstream's name) even
 * though the CLN-side file is named `clnBlockquote.ts`, so default keyboard
 * shortcuts (Mod-Alt-q), the `>` input rule, and HTML `<blockquote>` parse
 * rules keep working unchanged.
 */

import {
  createBlockConfig,
  createBlockSpec,
  createExtension,
  defaultProps,
  parseDefaultProps,
  addDefaultPropsExternalHTML,
} from "@blocknote/core";

export const createClnBlockquoteBlockConfig = createBlockConfig(
  () =>
    ({
      type: "quote" as const,
      propSchema: {
        backgroundColor: defaultProps.backgroundColor,
        textColor: defaultProps.textColor,
        anchorId: { default: "" as string },
      },
      content: "inline" as const,
    }) as const,
);

const createClnBlockquoteBlockSpec = createBlockSpec(
  createClnBlockquoteBlockConfig,
  {
    meta: {
      isolating: false,
    },
    parse(element) {
      if (element.tagName === "BLOCKQUOTE") {
        const { backgroundColor, textColor } = parseDefaultProps(element);

        return { backgroundColor, textColor };
      }

      return undefined;
    },
    render() {
      const quote = document.createElement("blockquote");

      return {
        dom: quote,
        contentDOM: quote,
      };
    },
    toExternalHTML(block) {
      const quote = document.createElement("blockquote");
      addDefaultPropsExternalHTML(block.props, quote);

      return {
        dom: quote,
        contentDOM: quote,
      };
    },
  },
  [
    createExtension({
      key: "cln-quote-block-shortcuts",
      keyboardShortcuts: {
        "Mod-Alt-q": ({ editor }) => {
          const cursorPosition = editor.getTextCursorPosition();

          if (
            editor.schema.blockSchema[cursorPosition.block.type].content !==
            "inline"
          ) {
            return false;
          }

          editor.updateBlock(cursorPosition.block, {
            type: "quote",
            props: {},
          });
          return true;
        },
      },
      inputRules: [
        {
          find: new RegExp(`^>\\s$`),
          replace() {
            return {
              type: "quote",
              props: {},
            };
          },
        },
      ],
    }),
  ],
);

export const clnBlockquoteSpec = createClnBlockquoteBlockSpec();
