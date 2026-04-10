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
 * Attempt to scan an INDENT, DEDENT, or LIST_CONTINUATION token based
 * on the current indentation stack state and the indentation of the
 * next non-blank line.
 *
 * Returns true if a token was emitted (with lexer->result_symbol set),
 * false otherwise. Updates `state->after_blank_line` as it encounters
 * blank lines.
 *
 * CASE MATRIX (after skipping blanks and counting indent of next line):
 *
 *   INDENT             : indent > current_top AND next line starts with
 *                        a list marker (- or N.). Zero-width at entry;
 *                        marker matched by the internal lexer next.
 *   LIST_CONTINUATION  : indent >= current_top AND next line is NOT a
 *                        list marker AND a blank line was seen. Token
 *                        extends from entry through the leading spaces.
 *   DEDENT             : indent < current_top. Zero-width at entry.
 *   return false       : everything else (same-level sibling items, plain
 *                        text at list's own indent with no blank, etc.)
 *
 * Token-boundary strategy:
 *   - mark_end at entry pins the zero-width point for DEDENT.
 *   - For INDENT and LIST_CONTINUATION we call mark_end AGAIN after the
 *     leading spaces of the non-blank line, so those tokens consume the
 *     blank lines and leading indent. The list marker is NOT consumed
 *     by the scanner — the internal lexer matches it next, starting
 *     from the mark_end position. (The grammar's list marker rule
 *     accepts optional leading whitespace for sibling items at nested
 *     levels, where the scanner does not fire because indent equals
 *     current_top.)
 *
 * `after_blank_line` is cleared whenever a list marker is seen so a
 * subsequent scanner call starts fresh.
 */
static bool scan_indent_tokens(TSLexer *lexer, ScannerState *state,
                               const bool *valid_symbols) {
  // During error recovery, tree-sitter marks all externals valid simultaneously.
  // Detect this state and bail — we should not emit tokens that mutate state during recovery.
  if (valid_symbols[CODE_BLOCK_CONTENT_RAW] && valid_symbols[DIRECTIVE_BODY_CONTENT_RAW] &&
      valid_symbols[INDENT] && valid_symbols[DEDENT] && valid_symbols[LIST_CONTINUATION]) {
    return false;
  }

  // Column gate: only run at the start of a line.
  if (lexer->get_column(lexer) != 0) return false;

  // Pin the token end at the entry position. DEDENT will use this
  // (zero-width at entry). For INDENT and LIST_CONTINUATION we call
  // mark_end AGAIN after the leading spaces of the target line, so
  // those tokens consume the blank lines and leading indent.
  lexer->mark_end(lexer);

  // Skip blank lines and leading spaces using skip=false so these
  // characters are part of the current lex range. The token end is
  // controlled by mark_end, so skip=false on these chars is safe:
  // for DEDENT we never call mark_end again, so the token stays at
  // entry; for INDENT/LIST_CONTINUATION we mark_end again after the
  // leading spaces so the token extends to that point.
  bool saw_blank = false;
  for (;;) {
    if (lexer->eof(lexer)) return false;

    while (lexer->lookahead == ' ') {
      lexer->advance(lexer, false);
    }
    if (lexer->lookahead == '\t') return false;

    if (lexer->lookahead == '\n') {
      lexer->advance(lexer, false);
      saw_blank = true;
      continue;
    }
    break;
  }

  if (saw_blank) {
    state->after_blank_line = true;
  }

  if (lexer->eof(lexer)) return false;

  // Indent count of the current (non-blank) line = current column.
  uint32_t indent = lexer->get_column(lexer);

  uint8_t current_top =
      state->depth > 0 ? state->stack[state->depth - 1] : 0;

  // EARLY DEDENT check: if this line is shallower than the current
  // level, emit DEDENT (zero-width at entry). We don't need to peek
  // for a marker — DEDENT fires regardless.
  if (valid_symbols[DEDENT] && indent < current_top) {
    if (state->depth > 1) {
      state->depth--;
    }
    state->after_blank_line = false;
    // Do NOT extend mark_end — keep it at the entry position for
    // zero-width DEDENT.
    lexer->result_symbol = DEDENT;
    return true;
  }

  // For INDENT/LIST_CONTINUATION we need to know if this line begins
  // with a list marker. Mark the token end HERE — at the first non-
  // space char of the target line — so that if we emit a token now,
  // it ends at this point and the next lex begins at the marker (or
  // first content character).
  lexer->mark_end(lexer);

  // Now peek for a list marker. These advances are "after mark_end",
  // so they do not affect the current token's range. Tree-sitter
  // will re-lex from mark_end on the next call regardless of where
  // the lexer position ends up.
  bool is_marker = false;
  int32_t ch = lexer->lookahead;
  if (ch == '-') {
    lexer->advance(lexer, false);
    if (lexer->lookahead == ' ') {
      is_marker = true;
    }
  } else if (ch >= '0' && ch <= '9') {
    while (lexer->lookahead >= '0' && lexer->lookahead <= '9') {
      lexer->advance(lexer, false);
    }
    if (lexer->lookahead == '.') {
      lexer->advance(lexer, false);
      if (lexer->lookahead == ' ') {
        is_marker = true;
      }
    }
  }

  // INDENT: deeper level + next line starts with a list marker.
  if (valid_symbols[INDENT] && is_marker && indent > current_top) {
    if (state->depth >= MAX_STACK_DEPTH) return false;
    state->stack[state->depth] = (uint8_t)indent;
    state->depth++;
    state->after_blank_line = false;
    lexer->result_symbol = INDENT;
    return true;
  }

  // LIST_CONTINUATION: same/deeper indent, not a marker, after blank.
  // Must be indent > 0: a non-indented block after a blank line is always
  // a new document-level block, never a continuation of a list item.
  if (valid_symbols[LIST_CONTINUATION] && !is_marker &&
      indent > 0 && indent >= current_top && state->after_blank_line) {
    state->after_blank_line = false;
    lexer->result_symbol = LIST_CONTINUATION;
    return true;
  }

  // Nothing matched. Clear after_blank_line when we saw a marker so
  // a subsequent scanner call for a sibling item starts fresh.
  if (is_marker) {
    state->after_blank_line = false;
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
  if (size > TREE_SITTER_SERIALIZATION_BUFFER_SIZE) return 0;  // tree-sitter buffer limit
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
  if (length < 2) {
    state->stack[0] = 0;
    state->depth = 1;
    state->after_blank_line = false;
    return;
  }
  uint8_t depth = (uint8_t)buffer[0];
  if (depth == 0 || depth > MAX_STACK_DEPTH || length < (unsigned)(2 + depth)) {
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
