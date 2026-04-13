/**
 * Lightweight CLN text → BlockNote blocks converter for initial content loading.
 *
 * This handles the common ClearNotation constructs (headings, paragraphs,
 * lists, code blocks, blockquotes) without needing the tree-sitter WASM
 * parser. Used when loading templates, opening files, or restoring sessions.
 *
 * Also handles directives (::callout, ::table, ::math, ::source, ::figure)
 * by emitting custom BlockNote block types registered in cln-schema.ts.
 */

interface SimpleBlock {
  type: string;
  props: Record<string, any>;
  content: any[];
  children: any[];
}

/**
 * Parse CLN inline formatting into BlockNote inline content.
 *
 * Handles: +{bold}, *{italic}, `code`, [label -> url]
 * Everything else becomes plain text.
 */
function parseInline(text: string): any[] {
  const result: any[] = [];
  let i = 0;

  while (i < text.length) {
    // Code span: `...`
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        result.push({ type: "text", text: text.slice(i + 1, end), styles: { code: true } });
        i = end + 1;
        continue;
      }
    }

    // Strong: +{...}
    if (text[i] === "+" && text[i + 1] === "{") {
      const end = findClosingBrace(text, i + 2);
      if (end !== -1) {
        result.push({ type: "text", text: text.slice(i + 2, end), styles: { bold: true } });
        i = end + 1;
        continue;
      }
    }

    // Emphasis: *{...}
    if (text[i] === "*" && text[i + 1] === "{") {
      const end = findClosingBrace(text, i + 2);
      if (end !== -1) {
        result.push({ type: "text", text: text.slice(i + 2, end), styles: { italic: true } });
        i = end + 1;
        continue;
      }
    }

    // Note: ^{...} — render as superscript-styled text
    if (text[i] === "^" && text[i + 1] === "{") {
      const end = findClosingBrace(text, i + 2);
      if (end !== -1) {
        result.push({ type: "text", text: "[" + text.slice(i + 2, end) + "]", styles: { italic: true } });
        i = end + 1;
        continue;
      }
    }

    // Link: [label -> url]
    if (text[i] === "[") {
      const close = text.indexOf("]", i + 1);
      if (close !== -1) {
        const inner = text.slice(i + 1, close);
        const sepIdx = inner.indexOf(" -> ");
        if (sepIdx !== -1) {
          const label = inner.slice(0, sepIdx);
          const href = inner.slice(sepIdx + 4);
          result.push({
            type: "link",
            href,
            content: [{ type: "text", text: label, styles: {} }],
          });
          i = close + 1;
          continue;
        }
      }
    }

    // Inline directive: ::ref[target="..."]
    if (text[i] === ":" && text[i + 1] === ":") {
      const refMatch = text.slice(i).match(/^::ref\[target="([^"]+)"\]/);
      if (refMatch) {
        result.push({ type: "clnRef", props: { target: refMatch[1] } });
        i += refMatch[0].length;
        continue;
      }
    }

    // Plain text: collect until the next special character
    let end = i + 1;
    while (end < text.length && !"+*`[^:".includes(text[end])) {
      end++;
    }
    result.push({ type: "text", text: text.slice(i, end), styles: {} });
    i = end;
  }

  return result.length > 0 ? result : [{ type: "text", text, styles: {} }];
}

/** Find closing } for a +{...} or *{...}, handling one level of nesting. */
function findClosingBrace(text: string, start: number): number {
  let depth = 1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
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

    // Directive blocks: ::name{...} or ::name[...]{
    const directiveMatch = line.match(/^\s*::(\w+)(\[.*\])?\s*\{?\s*$/);
    if (directiveMatch) {
      const directiveName = directiveMatch[1];
      if (line.includes("{")) {
        // Collect body lines until closing }
        const bodyLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trimStart().startsWith("}")) {
          bodyLines.push(lines[i]);
          i++;
        }
        i++; // skip closing }

        const bodyText = bodyLines.join("\n").trim();

        // ::math → custom clnMath block
        if (directiveName === "math") {
          blocks.push({
            type: "clnMath",
            props: { rawContent: bodyText },
            content: [],
            children: [],
          });
          continue;
        }

        // ::source → custom clnSource block
        if (directiveName === "source") {
          const langMatch = line.match(/language\s*=\s*"([^"]+)"/);
          blocks.push({
            type: "clnSource",
            props: { language: langMatch ? langMatch[1] : "", rawContent: bodyText },
            content: [],
            children: [],
          });
          continue;
        }

        // ::callout → custom clnCallout block
        if (directiveName === "callout") {
          const kindMatch = line.match(/kind\s*=\s*"([^"]+)"/);
          const titleMatch = line.match(/title\s*=\s*"([^"]+)"/);
          blocks.push({
            type: "clnCallout",
            props: {
              kind: kindMatch ? kindMatch[1] : "info",
              title: titleMatch ? titleMatch[1] : "",
              rawContent: bodyText,
            },
            content: [],
            children: [],
          });
          continue;
        }

        // ::table → custom clnTable block
        if (directiveName === "table") {
          const headerMatch = line.match(/header\s*=\s*true/);
          const alignMatch = line.match(/align\s*=\s*\[([^\]]+)\]/);
          const alignStr = alignMatch
            ? alignMatch[1].replace(/"/g, "").trim()
            : "";
          const tableData = bodyText
            .split("\n")
            .filter((l: string) => l.trim() !== "")
            .map((l: string) => l.split("|").map((c: string) => c.trim()));
          blocks.push({
            type: "clnTable",
            props: {
              header: !!headerMatch,
              tableData: JSON.stringify(tableData),
              align: alignStr,
            },
            content: [],
            children: [],
          });
          continue;
        }

        // ::figure → custom clnFigure block
        if (directiveName === "figure") {
          const srcMatch = line.match(/src\s*=\s*"([^"]+)"/);
          blocks.push({
            type: "clnFigure",
            props: { src: srcMatch ? srcMatch[1] : "", rawContent: bodyText },
            content: [],
            children: [],
          });
          continue;
        }

        // Other directives with bodies: render body lines as paragraphs
        for (const bodyLine of bodyLines) {
          if (bodyLine.trim()) {
            blocks.push({
              type: "paragraph",
              props: {},
              content: parseInline(bodyLine.trim()),
              children: [],
            });
          }
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
        content: parseInline(headingMatch[2]),
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
        content: parseInline(line.replace(/^\s*-\s+/, "")),
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
        content: parseInline(line.replace(/^\s*\d+\.\s+/, "")),
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
        content: parseInline(line.slice(2)),
        children: [],
      });
      i++;
      continue;
    }

    // Regular paragraph
    blocks.push({
      type: "paragraph",
      props: {},
      content: parseInline(line),
      children: [],
    });
    i++;
  }

  return blocks;
}
