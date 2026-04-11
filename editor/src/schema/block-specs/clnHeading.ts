/**
 * clnHeadingSpec — custom heading block spec that adds `anchorId`.
 *
 * Mirrors BlockNote's default heading spec (`createHeadingBlockSpec`) from
 * `@blocknote/core/src/blocks/Heading/block.ts`. The only functional change
 * is the addition of an optional `anchorId` prop on the propSchema, which is
 * used by the CLN notes/refs/anchors system to address blocks.
 *
 * The runtime BlockNote block type stays `"heading"` so BlockNote's slash
 * menu entries, keyboard shortcuts (Mod-Alt-1..6), markdown input rules
 * (`#`/`##`/...), and default HTML parse rules keep working unchanged.
 *
 * Anything other than the propSchema is copied from the upstream default
 * implementation.
 *
 * NOTE on toggle headings: the upstream default supports `allowToggleHeadings`
 * via the `getDetailsContent` helper, which is not part of `@blocknote/core`'s
 * public exports surface. We default `allowToggleHeadings` to `false` so that
 * we never need to call `getDetailsContent`. CLN does not currently use toggle
 * headings, so this is not a regression for our editor.
 */

import {
  BlockNoteEditor,
  createBlockConfig,
  createBlockSpec,
  createExtension,
  defaultProps,
  parseDefaultProps,
  addDefaultPropsExternalHTML,
} from "@blocknote/core";

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export interface ClnHeadingOptions {
  defaultLevel?: (typeof HEADING_LEVELS)[number];
  levels?: readonly number[];
  // TODO should probably use composition instead of this
  allowToggleHeadings?: boolean;
}

const createClnHeadingKeyboardShortcut =
  (level: number) =>
  ({ editor }: { editor: BlockNoteEditor<any, any, any> }) => {
    const cursorPosition = editor.getTextCursorPosition();

    if (
      editor.schema.blockSchema[cursorPosition.block.type].content !== "inline"
    ) {
      return false;
    }

    editor.updateBlock(cursorPosition.block, {
      type: "heading",
      props: { level },
    });

    return true;
  };

export const createClnHeadingBlockConfig = createBlockConfig(
  ({
    defaultLevel = 1,
    levels = HEADING_LEVELS,
    allowToggleHeadings = false,
  }: ClnHeadingOptions = {}) =>
    ({
      type: "heading" as const,
      propSchema: {
        ...defaultProps,
        level: { default: defaultLevel, values: levels },
        ...(allowToggleHeadings
          ? { isToggleable: { default: false, optional: true } as const }
          : {}),
        anchorId: { default: "" as string },
      },
      content: "inline",
    }) as const,
);

const createClnHeadingBlockSpec = createBlockSpec(
  createClnHeadingBlockConfig,
  () => ({
    meta: {
      isolating: false,
    },
    parse(e) {
      let level: number;
      switch (e.tagName) {
        case "H1":
          level = 1;
          break;
        case "H2":
          level = 2;
          break;
        case "H3":
          level = 3;
          break;
        case "H4":
          level = 4;
          break;
        case "H5":
          level = 5;
          break;
        case "H6":
          level = 6;
          break;
        default:
          return undefined;
      }

      return {
        ...parseDefaultProps(e),
        level,
      };
    },
    runsBefore: ["toggleListItem"],
    render(block) {
      const dom = document.createElement(`h${block.props.level}`);
      return {
        dom,
        contentDOM: dom,
      };
    },
    toExternalHTML(block) {
      const dom = document.createElement(`h${block.props.level}`);
      addDefaultPropsExternalHTML(block.props, dom);
      return {
        dom,
        contentDOM: dom,
      };
    },
  }),
  ({ levels = HEADING_LEVELS }: ClnHeadingOptions = {}) => [
    createExtension({
      key: "cln-heading-shortcuts",
      keyboardShortcuts: Object.fromEntries(
        levels.map((level) => [
          `Mod-Alt-${level}`,
          createClnHeadingKeyboardShortcut(level),
        ]) ?? [],
      ),
      inputRules: levels.map((level) => ({
        find: new RegExp(`^(#{${level}})\\s$`),
        replace({ match }: { match: RegExpMatchArray }) {
          return {
            type: "heading",
            props: {
              level: match[1].length,
            },
          };
        },
      })),
    }),
  ],
);

export const clnHeadingSpec = createClnHeadingBlockSpec();
