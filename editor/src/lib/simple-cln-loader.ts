/**
 * Lightweight CLN text → BlockNote blocks converter for initial content loading.
 *
 * This handles the common ClearNotation constructs (headings, paragraphs,
 * lists, code blocks, blockquotes) without needing the tree-sitter WASM
 * parser. Used when loading templates, opening files, or restoring sessions.
 *
 * Does NOT handle directives (::callout, ::meta, etc.) — those appear as
 * paragraphs. The user can edit them in the source pane.
 */

interface SimpleBlock {
  type: string;
  props: Record<string, any>;
  content: any[];
  children: any[];
}

/**
 * Convert ClearNotation source text to BlockNote blocks.
 */
export function clnTextToBlockNoteBlocks(text: string): SimpleBlock[] {
  const lines = text.split("\n");
  const blocks: SimpleBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Skip ::meta{...} blocks entirely
    if (line.trimStart().startsWith("::meta{")) {
      while (i < lines.length && !lines[i].trimStart().startsWith("}")) {
        i++;
      }
      i++; // skip closing }
      continue;
    }

    // Skip other directive blocks (::name{...} or ::name[...]{)
    if (/^\s*::(\w+)(\[.*\])?\s*\{?\s*$/.test(line)) {
      // If line ends with {, skip until matching }
      if (line.includes("{")) {
        let depth = 1;
        i++;
        while (i < lines.length && depth > 0) {
          if (lines[i].trimStart().startsWith("}")) depth--;
          else if (lines[i].trimEnd().endsWith("{")) depth++;
          i++;
        }
      } else {
        i++; // self-closing directive, skip
      }
      continue;
    }

    // Headings: # through ######
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push({
        type: "heading",
        props: { level },
        content: [{ type: "text", text: headingMatch[2], styles: {} }],
        children: [],
      });
      i++;
      continue;
    }

    // Code fence: ```lang
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({
        type: "codeBlock",
        props: { language: lang || "text" },
        content: [{ type: "text", text: codeLines.join("\n"), styles: {} }],
        children: [],
      });
      continue;
    }

    // Unordered list: - item
    if (line.match(/^\s*-\s+/)) {
      blocks.push({
        type: "bulletListItem",
        props: {},
        content: [{ type: "text", text: line.replace(/^\s*-\s+/, ""), styles: {} }],
        children: [],
      });
      i++;
      continue;
    }

    // Ordered list: 1. item
    if (line.match(/^\s*\d+\.\s+/)) {
      blocks.push({
        type: "numberedListItem",
        props: {},
        content: [{ type: "text", text: line.replace(/^\s*\d+\.\s+/, ""), styles: {} }],
        children: [],
      });
      i++;
      continue;
    }

    // Thematic break: ---
    if (line.trim() === "---") {
      // BlockNote doesn't have a thematic break, skip
      i++;
      continue;
    }

    // Blockquote: > text
    if (line.startsWith("> ")) {
      blocks.push({
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: line.slice(2), styles: {} }],
        children: [],
      });
      i++;
      continue;
    }

    // Regular paragraph
    blocks.push({
      type: "paragraph",
      props: {},
      content: [{ type: "text", text: line, styles: {} }],
      children: [],
    });
    i++;
  }

  return blocks;
}
