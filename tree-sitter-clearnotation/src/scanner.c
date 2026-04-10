/**
 * ClearNotation tree-sitter external scanner.
 *
 * Handles tokens that cannot be expressed with pure tree-sitter grammar
 * rules because they require context-sensitive handling:
 *
 *   1. CODE_BLOCK_CONTENT_RAW: scans lines until the closing ``` fence.
 *   2. DIRECTIVE_BODY_CONTENT_RAW: scans lines until the closing } line.
 *   3. INDENT / DEDENT / LIST_CONTINUATION: tracks an indentation stack
 *      so the grammar can express nested lists and multi-paragraph list
 *      items.
 *
 * The indent-related tokens are only emitted when the grammar says they
 * are valid (via valid_symbols). The scanner maintains a small stack of
 * indent levels across calls, which is serialized/deserialized so
 * tree-sitter can snapshot state between incremental-parse boundaries.
 */

#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

enum TokenType {
  CODE_BLOCK_CONTENT_RAW,
  DIRECTIVE_BODY_CONTENT_RAW,
  INDENT,
  DEDENT,
  LIST_CONTINUATION,
};

#define MAX_STACK_DEPTH 12

typedef struct {
  uint8_t stack[MAX_STACK_DEPTH];
  uint8_t depth;
  bool after_blank_line;
} ScannerState;

static inline bool is_ws(int32_t c) {
  return c == ' ' || c == '\t';
}

/**
 * Starting at the beginning of a line, check if the line's trimmed content
 * matches `delim` (followed only by optional whitespace and \n or EOF).
 *
 * Advances the lexer past the line in the process. Caller must use mark_end
 * strategically: call mark_end BEFORE calling this to keep the token boundary
 * at the start of the line if it turns out to be the closer.
 */
static bool line_is_closing(TSLexer *lexer, const char *delim) {
  // Skip leading whitespace
  while (is_ws(lexer->lookahead)) {
    lexer->advance(lexer, false);
  }

  // Match delimiter characters
  for (const char *p = delim; *p; p++) {
    if (lexer->lookahead != (int32_t)*p) return false;
    lexer->advance(lexer, false);
  }

  // After delimiter, only trailing whitespace and newline/EOF
  while (is_ws(lexer->lookahead)) {
    lexer->advance(lexer, false);
  }

  return lexer->lookahead == '\n' || lexer->eof(lexer);
}

/**
 * Skip to end of the current line (past the newline character).
 */
static void skip_to_next_line(TSLexer *lexer) {
  while (lexer->lookahead != '\n' && !lexer->eof(lexer)) {
    lexer->advance(lexer, false);
  }
  if (lexer->lookahead == '\n') {
    lexer->advance(lexer, false);
  }
}

/**
 * Scan raw content: consume complete lines until a line matches the
 * closing delimiter. Returns true if at least one line was consumed.
 *
 * Strategy:
 *   1. Mark the token end at the beginning of each line.
 *   2. Advance through the line to check if it is the delimiter.
 *   3. If it IS the delimiter: return. The token ends at the mark set
 *      before this line, so the delimiter line is NOT included.
 *   4. If it is NOT the delimiter: mark_end at the end of the line
 *      (after \n) to extend the token, then continue to the next line.
 */
static bool scan_raw_content(TSLexer *lexer, const char *delimiter) {
  bool consumed_any = false;

  while (!lexer->eof(lexer)) {
    // Mark end BEFORE examining this line. If this line is the closing
    // delimiter, the token will end here (before the delimiter line).
    lexer->mark_end(lexer);

    // Check if this line is the closing delimiter.
    // line_is_closing will advance the lexer, but we've already set
    // mark_end so the token boundary stays at the start of this line.
    if (line_is_closing(lexer, delimiter)) {
      // The token ends at the mark we just set (before this line).
      return consumed_any;
    }

    // Not a closing line. Advance to end of this line.
    // Note: line_is_closing already advanced partially through the line
    // (it returned false partway through). We need to finish the line.
    skip_to_next_line(lexer);

    // Now extend the token to include this line.
    lexer->mark_end(lexer);
    consumed_any = true;
  }

  // Reached EOF without finding the delimiter. Include everything.
  return consumed_any;
}

// ═══════════════════════════════════════════════════════════════════════
// Indent / dedent / list-continuation scanning
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check whether the current line (from lexer->lookahead position) is
 * a blank line (only whitespace before newline/EOF). Does NOT advance.
 *
 * We can't peek without advancing in tree-sitter, so this helper is
 * implemented as part of the main scan loop below using mark_end.
 */

/**
 * Attempt to scan an INDENT, DEDENT, or LIST_CONTINUATION token based
 * on the current indentation stack state and the indentation of the
 * next non-blank line.
 *
 * Returns true if a token was emitted (with lexer->result_symbol set),
 * false otherwise. Updates `state->after_blank_line` as it encounters
 * blank lines.
 *
 * Design for zero-width DEDENT tokens: we call lexer->mark_end(lexer)
 * immediately on entry (before any advance), which pins the token's end
 * at the current position. For INDENT and LIST_CONTINUATION we call
 * mark_end AGAIN after counting the leading spaces of the significant
 * line, so those tokens consume the indent whitespace. For DEDENT we
 * leave the initial mark in place, producing a zero-width token before
 * the first blank line we skipped (or the start position if there were
 * none).
 */
static bool scan_indent_tokens(TSLexer *lexer, ScannerState *state,
                               const bool *valid_symbols) {
  // Pin the token's end at the current position so that DEDENT — which
  // should be zero-width at the point where the scanner was invoked —
  // does not accidentally consume any of the blank lines or leading
  // spaces we examine below.
  lexer->mark_end(lexer);

  // Skip any number of blank lines. A blank line is zero-or-more
  // spaces/tabs followed by '\n'. We use advance(true) to mark the
  // characters as whitespace so they are not part of any token.
  bool saw_blank = false;
  while (!lexer->eof(lexer)) {
    // Remember the start of this line so we can tell if it was blank.
    // We advance through any leading spaces/tabs. If we hit '\n', the
    // line was blank; otherwise we've consumed the leading indent and
    // are sitting on the first non-whitespace char.
    //
    // Because advancing past non-blank leading spaces commits us to
    // consuming them (they can't be un-advanced), we need to be careful
    // here: if we find a NON-blank line, we must NOT advance past its
    // leading spaces at this point — the decision logic below needs to
    // both count the indent and (for DEDENT) keep the token zero-width.
    //
    // We peek by counting leading spaces via advance(true). We treat
    // the advanced whitespace as "skipped" (not part of any token) for
    // both the blank-line case AND the non-blank-line case. This is
    // safe because a subsequent INDENT/LIST_CONTINUATION token will
    // simply begin at the first non-whitespace char — the grammar
    // doesn't care that the leading spaces were "consumed" as skip.
    uint32_t indent = 0;
    bool saw_tab = false;
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
      if (lexer->lookahead == '\t') {
        saw_tab = true;
      }
      indent++;
      lexer->advance(lexer, true);
    }

    // Reject tabs in indentation.
    if (saw_tab) {
      return false;
    }

    if (lexer->lookahead == '\n') {
      // Blank line — skip the newline and loop to the next line.
      lexer->advance(lexer, true);
      saw_blank = true;
      continue;
    }

    if (lexer->eof(lexer)) {
      // EOF after possibly-blank lines. We don't emit indent tokens
      // at EOF — let the grammar handle end-of-document.
      return false;
    }

    // We are now at the first non-whitespace character of a non-blank
    // line, and `indent` contains its leading-space count. We have NOT
    // called mark_end since entry, so the token remains zero-width at
    // the original scan position.
    if (saw_blank) {
      state->after_blank_line = true;
    }

    uint8_t current_top =
        state->depth > 0 ? state->stack[state->depth - 1] : 0;

    // INDENT: deeper than the current level and grammar wants one.
    if (valid_symbols[INDENT] && indent > current_top) {
      if (state->depth >= MAX_STACK_DEPTH) {
        return false;
      }
      state->stack[state->depth] = (uint8_t)indent;
      state->depth++;
      state->after_blank_line = false;
      // Extend token end to the current position (after the indent
      // spaces) so this token consumes the leading spaces.
      lexer->mark_end(lexer);
      lexer->result_symbol = INDENT;
      return true;
    }

    // DEDENT: shallower than the current level and grammar wants one.
    if (valid_symbols[DEDENT] && indent < current_top) {
      // Pop one level. Emit a zero-width DEDENT token. Do NOT call
      // mark_end again — the initial mark_end at entry keeps the
      // token's end at the position where scan was invoked, which is
      // BEFORE the blank lines / leading spaces we examined.
      if (state->depth > 1) {
        state->depth--;
      }
      state->after_blank_line = false;
      lexer->result_symbol = DEDENT;
      return true;
    }

    // LIST_CONTINUATION: same indent, and we crossed a blank line.
    if (valid_symbols[LIST_CONTINUATION] && indent == current_top &&
        state->after_blank_line) {
      state->after_blank_line = false;
      lexer->mark_end(lexer);
      lexer->result_symbol = LIST_CONTINUATION;
      return true;
    }

    // None of the three tokens fit here. Bail out.
    return false;
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════
// Tree-sitter external scanner API
// ═══════════════════════════════════════════════════════════════════════

void *tree_sitter_clearnotation_external_scanner_create(void) {
  ScannerState *state = (ScannerState *)calloc(1, sizeof(ScannerState));
  if (state) {
    state->stack[0] = 0;
    state->depth = 1;
    state->after_blank_line = false;
  }
  return state;
}

void tree_sitter_clearnotation_external_scanner_destroy(void *payload) {
  free(payload);
}

unsigned tree_sitter_clearnotation_external_scanner_serialize(
    void *payload, char *buffer) {
  ScannerState *state = (ScannerState *)payload;
  if (!state || state->depth > MAX_STACK_DEPTH) return 0;
  unsigned size = 2 + state->depth; // depth byte + flags byte + stack bytes
  if (size > 1024) return 0;        // tree-sitter buffer limit
  buffer[0] = (char)state->depth;
  buffer[1] = state->after_blank_line ? 1 : 0;
  for (uint8_t i = 0; i < state->depth; i++) {
    buffer[2 + i] = (char)state->stack[i];
  }
  return size;
}

void tree_sitter_clearnotation_external_scanner_deserialize(
    void *payload, const char *buffer, unsigned length) {
  ScannerState *state = (ScannerState *)payload;
  if (!state) return;
  if (length == 0) {
    state->stack[0] = 0;
    state->depth = 1;
    state->after_blank_line = false;
    return;
  }
  if (length < 2) {
    state->stack[0] = 0;
    state->depth = 1;
    state->after_blank_line = false;
    return;
  }
  uint8_t depth = (uint8_t)buffer[0];
  if (depth > MAX_STACK_DEPTH || length < (unsigned)(2 + depth)) {
    state->stack[0] = 0;
    state->depth = 1;
    state->after_blank_line = false;
    return;
  }
  state->depth = depth;
  state->after_blank_line = buffer[1] != 0;
  for (uint8_t i = 0; i < depth; i++) {
    state->stack[i] = (uint8_t)buffer[2 + i];
  }
}

bool tree_sitter_clearnotation_external_scanner_scan(
    void *payload, TSLexer *lexer, const bool *valid_symbols) {
  ScannerState *state = (ScannerState *)payload;

  // Handle indent-related tokens first, but only when the grammar
  // asks for them. This keeps the scanner from firing spuriously
  // during non-list contexts.
  if (state != NULL &&
      (valid_symbols[INDENT] || valid_symbols[DEDENT] ||
       valid_symbols[LIST_CONTINUATION])) {
    if (scan_indent_tokens(lexer, state, valid_symbols)) {
      return true;
    }
  }

  // Only attempt scanning when the grammar says these tokens are valid.
  // Check code block first (more specific delimiter).
  if (valid_symbols[CODE_BLOCK_CONTENT_RAW]) {
    if (scan_raw_content(lexer, "```")) {
      lexer->result_symbol = CODE_BLOCK_CONTENT_RAW;
      return true;
    }
  }

  if (valid_symbols[DIRECTIVE_BODY_CONTENT_RAW]) {
    if (scan_raw_content(lexer, "}")) {
      lexer->result_symbol = DIRECTIVE_BODY_CONTENT_RAW;
      return true;
    }
  }

  return false;
}
