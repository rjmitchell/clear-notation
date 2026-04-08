export function convertMarkdownToCln(md: string): string {
  let result = md;
  // **bold** or __bold__ → +{bold}
  result = result.replace(/\*\*(.+?)\*\*/g, "+{$1}");
  result = result.replace(/__(.+?)__/g, "+{$1}");
  // *italic* or _italic_ → *{italic} (but not already-converted +{...})
  result = result.replace(/(?<!\+)\*([^*\n]+?)\*/g, "*{$1}");
  result = result.replace(/(?<!_)_([^_\n]+?)_(?!_)/g, "*{$1}");
  // [text](url) → [text -> url]
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[$1 -> $2]");
  return result;
}
