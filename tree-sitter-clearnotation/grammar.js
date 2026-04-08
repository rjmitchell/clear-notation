/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// ClearNotation v0.1 tree-sitter grammar
//
// Design principle: highlight the SYNTACTIC FRAME without knowing the
// directive registry. Any `::name` is treated as a valid directive. We
// do not validate directive names, body modes, or attribute schemas.
//
// Raw content (code blocks, directive bodies) is handled by an external
// scanner that stops before the closing delimiter line.

module.exports = grammar({
  name: "clearnotation",

  extras: (_) => [],

  // The `word` rule tells tree-sitter that `identifier` is the base
  // keyword pattern. When the lexer matches /[a-z][a-z0-9-]*/, it
  // checks whether the matched text is a keyword (like "true" or
  // "false") that is valid in the current parser state. This prevents
  // "true" from being tokenized as `identifier` in value position, and
  // prevents keywords from hijacking identifier position.
  word: ($) => $.identifier,

  externals: ($) => [
    $._code_block_content_raw,
    $._directive_body_content_raw,
  ],

  conflicts: ($) => [],

  rules: {
    // ═══════════════════════════════════════════════════════════════════
    // Document structure
    // ═══════════════════════════════════════════════════════════════════

    document: ($) =>
      seq(
        optional($.bom),
        repeat($._blank_line),
        optional(seq($.meta_block, repeat($._blank_line))),
        optional($._block_list),
      ),

    _block_list: ($) =>
      prec.left(seq(
        $._block,
        repeat(seq(repeat($._blank_line), $._block)),
        repeat($._blank_line),
      )),

    _block: ($) =>
      choice(
        $.comment,
        $.heading,
        $.thematic_break,
        $.fenced_code_block,
        $.blockquote,
        $.unordered_list,
        $.ordered_list,
        $.block_directive_with_body,
        $.block_directive_self_closing,
        $.paragraph,
      ),

    // ═══════════════════════════════════════════════════════════════════
    // Comments: // ...
    // ═══════════════════════════════════════════════════════════════════

    comment: (_) =>
      prec(15, token(seq(
        /[ \t]*/,
        "//",
        /[^\n]*/,
        "\n",
      ))),

    _blank_line: (_) => /[ \t]*\n/,

    // ═══════════════════════════════════════════════════════════════════
    // Heading: # through ###### + space + content
    // ═══════════════════════════════════════════════════════════════════

    heading: ($) =>
      prec(10, seq(
        $.heading_marker,
        " ",
        $.inline_content,
        $._line_ending,
      )),

    heading_marker: (_) =>
      token(prec(10, choice("######", "#####", "####", "###", "##", "#"))),

    // ═══════════════════════════════════════════════════════════════════
    // Thematic break: ---
    // ═══════════════════════════════════════════════════════════════════

    thematic_break: (_) =>
      token(prec(8, seq("---", /[ \t]*\n/))),

    // ═══════════════════════════════════════════════════════════════════
    // Fenced code block: ```lang\n...\n```
    // ═══════════════════════════════════════════════════════════════════

    fenced_code_block: ($) =>
      prec(12, seq(
        $.code_fence_open,
        $.language_tag,
        $._line_ending,
        optional($.code_block_content),
        $.code_fence_close,
      )),

    code_fence_open: (_) => token(prec(12, "```")),

    // Closing fence: optional leading ws, ```, optional trailing ws, newline
    code_fence_close: (_) => token(prec(13, seq(/[ \t]*/, "```", /[ \t]*\n/))),

    language_tag: (_) =>
      token(prec(12, /[a-zA-Z0-9]([a-zA-Z0-9.+\-]*[a-zA-Z0-9])?/)),

    code_block_content: ($) => $._code_block_content_raw,

    // ═══════════════════════════════════════════════════════════════════
    // Blockquote: > lines
    // ═══════════════════════════════════════════════════════════════════

    blockquote: ($) => prec.left(repeat1($.blockquote_line)),

    blockquote_line: ($) =>
      prec(6, seq(
        $.blockquote_marker,
        $.inline_content,
        $._line_ending,
      )),

    blockquote_marker: (_) => token(prec(6, "> ")),

    // ═══════════════════════════════════════════════════════════════════
    // Lists
    // ═══════════════════════════════════════════════════════════════════

    unordered_list: ($) => prec.left(repeat1($.unordered_list_item)),

    unordered_list_item: ($) =>
      prec(6, seq(
        $.unordered_list_marker,
        $.inline_content,
        $._line_ending,
      )),

    unordered_list_marker: (_) => token(prec(7, "- ")),

    ordered_list: ($) => prec.left(repeat1($.ordered_list_item)),

    ordered_list_item: ($) =>
      prec(6, seq(
        $.ordered_list_marker,
        $.inline_content,
        $._line_ending,
      )),

    ordered_list_marker: (_) =>
      token(prec(7, seq(/[0-9]+/, ". "))),

    // ═══════════════════════════════════════════════════════════════════
    // Paragraph: fallback for non-blank lines
    // ═══════════════════════════════════════════════════════════════════

    paragraph: ($) => prec.left(-5, repeat1($.paragraph_line)),

    paragraph_line: ($) =>
      prec(-5, seq(
        $.inline_content,
        $._line_ending,
      )),

    // ═══════════════════════════════════════════════════════════════════
    // Meta block: ::meta{ ... }
    // ═══════════════════════════════════════════════════════════════════

    meta_block: ($) =>
      prec(20, seq(
        $.meta_block_open,
        $._line_ending,
        repeat(choice($.meta_entry, $._blank_line)),
        optional($._ws),
        $.block_close,
        $._line_ending,
      )),

    // Single token so that `::meta{` wins over `::` + `meta` + `{`
    meta_block_open: (_) => token(prec(20, "::meta{")),

    meta_entry: ($) =>
      seq(
        optional($._ws),
        $.meta_key,
        optional($._ws),
        "=",
        optional($._ws),
        $.value,
        $._line_ending,
      ),

    meta_key: ($) =>
      seq($.identifier, repeat(seq(".", $.identifier))),

    // ═══════════════════════════════════════════════════════════════════
    // Block directives
    // ═══════════════════════════════════════════════════════════════════

    // Self-closing: ::name or ::name[attrs]
    block_directive_self_closing: ($) =>
      prec(14, seq(
        $.directive_marker,
        alias($.identifier, $.directive_name),
        optional($.attribute_list),
        $._line_ending,
      )),

    // With body: ::name[attrs]{ ... }
    block_directive_with_body: ($) =>
      prec(15, seq(
        $.directive_marker,
        alias($.identifier, $.directive_name),
        optional($.attribute_list),
        $.directive_body_open,
        $._line_ending,
        optional($.directive_body_content),
        optional($._ws),
        $.block_close,
        $._line_ending,
      )),

    directive_marker: (_) => token(prec(15, "::")),

    directive_body_open: (_) => "{",

    // Closing brace for meta block and directive bodies.
    // NOT a single token -- kept as a simple "}" so it doesn't conflict
    // with styled_close at the lexer level. The surrounding grammar
    // rules handle the leading/trailing whitespace and newline.
    block_close: (_) => "}",

    directive_body_content: ($) => $._directive_body_content_raw,

    // ═══════════════════════════════════════════════════════════════════
    // Attribute list: [key=val, key="string", ...]
    // ═══════════════════════════════════════════════════════════════════

    attribute_list: ($) =>
      seq(
        "[",
        optional($._ws),
        optional(
          seq(
            $.attribute,
            repeat(seq(optional($._ws), ",", optional($._ws), $.attribute)),
          ),
        ),
        optional($._ws),
        "]",
      ),

    attribute: ($) =>
      seq(
        alias($.identifier, $.attribute_key),
        optional($._ws),
        "=",
        optional($._ws),
        $.value,
      ),

    // ═══════════════════════════════════════════════════════════════════
    // Values
    // ═══════════════════════════════════════════════════════════════════

    value: ($) =>
      choice(
        $.string,
        $.boolean,
        $.integer,
        $.array,
      ),

    string: ($) =>
      seq(
        '"',
        optional($.string_content),
        '"',
      ),

    string_content: (_) => /([^"\\\n]|\\\\|\\"|\\n|\\r|\\t)+/,

    boolean: (_) => choice("true", "false"),

    integer: (_) => token(seq(optional("-"), /[0-9]+/)),

    array: ($) =>
      seq(
        "[",
        optional($._ws),
        optional(
          seq(
            $._scalar_value,
            repeat(seq(optional($._ws), ",", optional($._ws), $._scalar_value)),
          ),
        ),
        optional($._ws),
        "]",
      ),

    _scalar_value: ($) =>
      choice($.string, $.boolean, $.integer),

    // ═══════════════════════════════════════════════════════════════════
    // Inline content
    // ═══════════════════════════════════════════════════════════════════

    inline_content: ($) => prec.left(repeat1($._inline_element)),

    _inline_element: ($) =>
      choice(
        $.strong,
        $.emphasis,
        $.note,
        $.link,
        $.code_span,
        $.inline_directive,
        $.escape_sequence,
        $.text,
      ),

    // ─── Strong: +{...} ──────────────────────────────────────────────
    strong: ($) =>
      prec(5, seq(
        $.strong_open,
        repeat1($._styled_element),
        $.styled_close,
      )),

    strong_open: (_) => token(prec(5, "+{")),

    _styled_element: ($) =>
      choice(
        $.code_span,
        $.escape_sequence,
        $.styled_text,
      ),

    styled_text: (_) => prec(-1, /[^\n}`\\]+/),

    // ─── Emphasis: *{...} ────────────────────────────────────────────
    emphasis: ($) =>
      prec(5, seq(
        $.emphasis_open,
        repeat1($._styled_element),
        $.styled_close,
      )),

    emphasis_open: (_) => token(prec(5, "*{")),

    // Shared closing brace for strong, emphasis, note
    styled_close: (_) => "}",

    // ─── Note: ^{...} ───────────────────────────────────────────────
    note: ($) =>
      prec(5, seq(
        $.note_open,
        repeat1($._note_element),
        $.styled_close,
      )),

    note_open: (_) => token(prec(5, "^{")),

    _note_element: ($) =>
      choice(
        $.strong,
        $.emphasis,
        $.link,
        $.code_span,
        $.inline_directive,
        $.escape_sequence,
        $.note_text,
      ),

    note_text: (_) => prec(-1, /[^\n}`\\+*^\[:]+/),

    // ─── Link: [label -> url] ────────────────────────────────────────
    link: ($) =>
      prec(4, seq(
        "[",
        $.link_label,
        $.link_separator,
        $.link_target,
        "]",
      )),

    link_label: ($) => repeat1($._link_label_element),

    _link_label_element: ($) =>
      choice(
        $.strong,
        $.emphasis,
        $.code_span,
        $.escape_sequence,
        alias(/[ \t]+/, $.link_text),
        $.link_text,
      ),

    link_separator: (_) => token(prec(5, " -> ")),

    link_text: (_) => prec(-3, /[^\n\]}`\\+*^\[ \t]+/),

    link_target: (_) => /[^\]\\ \t\n]+/,

    // ─── Code span: `...` ────────────────────────────────────────────
    code_span: ($) =>
      prec(6, seq(
        "`",
        optional($.code_span_content),
        "`",
      )),

    code_span_content: (_) => /([^`\\\n]|\\`|\\\\)+/,

    // ─── Inline directive: ::name[attrs] ─────────────────────────────
    inline_directive: ($) =>
      prec.right(10, seq(
        $.directive_marker,
        alias($.identifier, $.directive_name),
        optional($.attribute_list),
      )),

    // ─── Escape sequence: \X ─────────────────────────────────────────
    escape_sequence: (_) => token(prec(8, /\\[\\{}\[\]`+*^:>\-#|"]/)),

    // ─── Plain text (fallback) ───────────────────────────────────────
    text: (_) => prec(-2, /[^\n`+*^\[:\\]+/),

    // ═══════════════════════════════════════════════════════════════════
    // Shared terminals
    // ═══════════════════════════════════════════════════════════════════

    // Single identifier rule used everywhere (directive names, attribute
    // keys, meta keys). The grammar aliases it to directive_name /
    // attribute_key for highlighting purposes.
    identifier: (_) => /[a-z][a-z0-9-]*/,

    _line_ending: (_) => /[ \t]*\n/,

    _ws: (_) => /[ \t]+/,

    bom: (_) => "\uFEFF",
  },
});
