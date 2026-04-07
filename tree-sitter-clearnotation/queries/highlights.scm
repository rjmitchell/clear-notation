; ClearNotation v0.1 — syntax highlighting queries
;
; Highlight groups follow tree-sitter conventions used by Neovim, Helix,
; and other editors with tree-sitter support.

; ═══════════════════════════════════════════════════════════════════════
; Headings
; ═══════════════════════════════════════════════════════════════════════

(heading
  (heading_marker) @markup.heading
  (inline_content) @markup.heading)

; ═══════════════════════════════════════════════════════════════════════
; Strong / Bold: +{...}
; ═══════════════════════════════════════════════════════════════════════

(strong
  (strong_open) @punctuation.special
  (styled_close) @punctuation.bracket) @markup.bold

; ═══════════════════════════════════════════════════════════════════════
; Emphasis / Italic: *{...}
; ═══════════════════════════════════════════════════════════════════════

(emphasis
  (emphasis_open) @punctuation.special
  (styled_close) @punctuation.bracket) @markup.italic

; ═══════════════════════════════════════════════════════════════════════
; Notes: ^{...}
; ═══════════════════════════════════════════════════════════════════════

(note
  (note_open) @punctuation.special
  (styled_close) @punctuation.bracket)

; ═══════════════════════════════════════════════════════════════════════
; Links: [label -> url]
; ═══════════════════════════════════════════════════════════════════════

(link
  "[" @punctuation.bracket
  (link_separator) @punctuation.delimiter
  (link_target) @markup.link
  "]" @punctuation.bracket)

; ═══════════════════════════════════════════════════════════════════════
; Code spans: `...`
; ═══════════════════════════════════════════════════════════════════════

(code_span
  "`" @punctuation.bracket)

(code_span
  (code_span_content) @markup.raw)

; ═══════════════════════════════════════════════════════════════════════
; Fenced code blocks: ```lang ... ```
; ═══════════════════════════════════════════════════════════════════════

(fenced_code_block
  (code_fence_open) @punctuation.bracket
  (language_tag) @tag
  (code_fence_close) @punctuation.bracket)

(fenced_code_block
  (code_block_content) @markup.raw)

; ═══════════════════════════════════════════════════════════════════════
; Blockquote
; ═══════════════════════════════════════════════════════════════════════

(blockquote_line
  (blockquote_marker) @punctuation.special)

; ═══════════════════════════════════════════════════════════════════════
; Lists
; ═══════════════════════════════════════════════════════════════════════

(unordered_list_item
  (unordered_list_marker) @punctuation.special)

(ordered_list_item
  (ordered_list_marker) @punctuation.special)

; ═══════════════════════════════════════════════════════════════════════
; Thematic break: ---
; ═══════════════════════════════════════════════════════════════════════

(thematic_break) @punctuation.special

; ═══════════════════════════════════════════════════════════════════════
; Directives: ::name[attrs] and ::name[attrs]{ ... }
; ═══════════════════════════════════════════════════════════════════════

; The :: prefix
(directive_marker) @keyword

; Directive name (alias of identifier in directive contexts)
(directive_name) @tag

; Block directive body delimiters
(block_directive_with_body
  (directive_body_open) @punctuation.bracket
  (block_close) @punctuation.bracket)

; ═══════════════════════════════════════════════════════════════════════
; Attribute lists: [key=val, ...]
; ═══════════════════════════════════════════════════════════════════════

(attribute_list
  "[" @punctuation.bracket
  "]" @punctuation.bracket)

(attribute_list
  "," @punctuation.delimiter)

; Attribute key (alias of identifier in attribute contexts)
(attribute_key) @property

(attribute
  "=" @punctuation.delimiter)

; ═══════════════════════════════════════════════════════════════════════
; Values
; ═══════════════════════════════════════════════════════════════════════

(string) @string
(boolean) @constant.builtin
(integer) @number

; ═══════════════════════════════════════════════════════════════════════
; Arrays
; ═══════════════════════════════════════════════════════════════════════

(array
  "[" @punctuation.bracket
  "]" @punctuation.bracket)

(array
  "," @punctuation.delimiter)

; ═══════════════════════════════════════════════════════════════════════
; Meta block: ::meta{ ... }
; ═══════════════════════════════════════════════════════════════════════

(meta_block
  (meta_block_open) @keyword)

(meta_block
  (block_close) @punctuation.bracket)

(meta_entry
  (meta_key
    (identifier) @property))

(meta_entry
  "=" @punctuation.delimiter)

(meta_entry
  (value) @comment)

; ═══════════════════════════════════════════════════════════════════════
; Escape sequences: \X
; ═══════════════════════════════════════════════════════════════════════

(escape_sequence) @string.escape
