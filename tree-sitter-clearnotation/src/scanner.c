/**
 * ClearNotation tree-sitter external scanner.
 *
 * Handles raw content blocks that cannot be expressed with pure tree-sitter
 * grammar rules because they require context-sensitive termination:
 *
 *   1. Code block content: everything between ```lang\n and a line with ```
 *   2. Directive body content: everything between ::name[attrs]{\n and a line with }
 *
 * Both scan complete lines until a line whose left-trimmed content is exactly
 * the closing delimiter (optionally followed by whitespace), then stop
 * *before* that closing line so the grammar can match it.
 */

#include "tree_sitter/parser.h"

#include <stdbool.h>

enum TokenType {
  CODE_BLOCK_CONTENT_RAW,
  DIRECTIVE_BODY_CONTENT_RAW,
};

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
// Tree-sitter external scanner API
// ═══════════════════════════════════════════════════════════════════════

void *tree_sitter_clearnotation_external_scanner_create(void) {
  return NULL;
}

void tree_sitter_clearnotation_external_scanner_destroy(void *payload) {
}

unsigned tree_sitter_clearnotation_external_scanner_serialize(
    void *payload, char *buffer) {
  return 0;
}

void tree_sitter_clearnotation_external_scanner_deserialize(
    void *payload, const char *buffer, unsigned length) {
}

bool tree_sitter_clearnotation_external_scanner_scan(
    void *payload, TSLexer *lexer, const bool *valid_symbols) {

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
