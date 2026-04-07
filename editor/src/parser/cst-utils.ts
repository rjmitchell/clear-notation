/**
 * Utility functions for traversing and querying serialized CSTNode trees.
 *
 * These work on the serializable CSTNode type (not tree-sitter's native
 * SyntaxNode), so they can be used on both the main thread and in tests.
 */

import type { CSTNode } from "./types";

/** Find the first direct child with the given node type. */
export function findChildByType(
  node: CSTNode,
  type: string
): CSTNode | null {
  for (const child of node.children) {
    if (child.type === type) return child;
  }
  return null;
}

/** Find all direct children with the given node type. */
export function findChildrenByType(
  node: CSTNode,
  type: string
): CSTNode[] {
  return node.children.filter((child) => child.type === type);
}

/**
 * Extract the directive name from a directive node.
 * Works for block_directive_self_closing, block_directive_with_body,
 * and inline_directive nodes.
 */
export function getDirectiveName(node: CSTNode): string | null {
  const nameNode = findChildByType(node, "directive_name");
  return nameNode ? nameNode.text : null;
}

/**
 * Extract the heading level from a heading node.
 * Returns the number of '#' characters (1-6), or 0 if not a heading.
 */
export function getHeadingLevel(node: CSTNode): number {
  const marker = findChildByType(node, "heading_marker");
  if (!marker) return 0;
  return marker.text.length;
}

/**
 * Extract attributes from a directive node as a key-value map.
 * Handles string, boolean, and integer values.
 */
export function getAttributeMap(
  node: CSTNode
): Record<string, string | boolean | number | string[]> {
  const attrList = findChildByType(node, "attribute_list");
  if (!attrList) return {};

  const attrs: Record<string, string | boolean | number | string[]> = {};
  const attrNodes = findChildrenByType(attrList, "attribute");

  for (const attr of attrNodes) {
    const keyNode = findChildByType(attr, "attribute_key");
    const valueNode = findChildByType(attr, "value");
    if (!keyNode || !valueNode) continue;

    const key = keyNode.text;
    const value = parseValue(valueNode);
    if (value !== undefined) {
      attrs[key] = value;
    }
  }

  return attrs;
}

/**
 * Parse a value node into a JS primitive.
 */
function parseValue(
  valueNode: CSTNode
): string | boolean | number | string[] | undefined {
  // Check for string
  const stringNode = findChildByType(valueNode, "string");
  if (stringNode) {
    const content = findChildByType(stringNode, "string_content");
    return content ? content.text : "";
  }

  // Check for boolean
  const boolNode = findChildByType(valueNode, "boolean");
  if (boolNode) {
    return boolNode.text === "true";
  }

  // Check for integer
  const intNode = findChildByType(valueNode, "integer");
  if (intNode) {
    return parseInt(intNode.text, 10);
  }

  // Check for array
  const arrayNode = findChildByType(valueNode, "array");
  if (arrayNode) {
    const elements: string[] = [];
    // Array contains _scalar_value nodes which contain string/boolean/integer
    // In practice, ClearNotation arrays contain strings
    for (const child of arrayNode.children) {
      if (child.type === "string") {
        const content = findChildByType(child, "string_content");
        elements.push(content ? content.text : "");
      }
    }
    return elements;
  }

  return undefined;
}

/**
 * Extract the raw body text from a directive-with-body node.
 */
export function getBodyText(node: CSTNode): string {
  const bodyContent = findChildByType(node, "directive_body_content");
  return bodyContent ? bodyContent.text : "";
}

/**
 * Check if a node or any of its descendants has a parse error.
 */
export function hasErrorDescendant(node: CSTNode): boolean {
  if (node.hasError) return true;
  for (const child of node.children) {
    if (hasErrorDescendant(child)) return true;
  }
  return false;
}
