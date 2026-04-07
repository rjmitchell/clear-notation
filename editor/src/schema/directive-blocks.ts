/**
 * Directive block specifications generated from the registry.
 *
 * Each directive in the registry maps to a BlockNote block spec
 * based on its body_mode:
 *
 *   body_mode="parsed" -> content: "inline" (nested contentEditable)
 *   body_mode="raw"    -> content: "none" (code editor, rawContent prop)
 *   body_mode="none"   -> content: "none" (void block, no body)
 *
 * Special case: table is body_mode="raw" but gets content: "table"
 * because it needs a custom editable table UI, not a code editor.
 */

import type { CLNPropDef } from "./core-blocks";
import {
  getBlockDirectives,
  type RegistryDirective,
  type RegistryAttribute,
} from "./registry-types";

/** Extended block spec that includes registry metadata. */
export interface CLNDirectiveBlockSpec {
  type: string;
  propSchema: Record<string, CLNPropDef>;
  content: "inline" | "none" | "table";
  directiveName: string;
  bodyMode: "parsed" | "raw" | "none";
  registryAttributes: RegistryAttribute[];
}

/**
 * Convert a directive name to a BlockNote block type name.
 * "callout" -> "clnCallout", "toc" -> "clnToc"
 */
function toBlockType(directiveName: string): string {
  return "cln" + directiveName.charAt(0).toUpperCase() + directiveName.slice(1);
}

/**
 * Determine the default value for an attribute based on its type.
 */
function attrDefault(attr: RegistryAttribute): string | number | boolean {
  if (attr.default !== undefined) {
    if (typeof attr.default === "boolean") return attr.default;
    if (typeof attr.default === "number") return attr.default;
    return String(attr.default);
  }

  // For required string attributes with allowed_values, default to the first
  if (attr.type === "string" && attr.allowed_values && attr.allowed_values.length > 0) {
    return attr.allowed_values[0];
  }

  switch (attr.type) {
    case "string":
      return "";
    case "boolean":
      return false;
    case "number":
      return 0;
    case "string[]":
      return ""; // Serialized as string for BlockNote prop compatibility
    default:
      return "";
  }
}

/**
 * Map a registry attribute type to a BlockNote prop type.
 */
function attrPropType(attr: RegistryAttribute): "string" | "number" | "boolean" {
  switch (attr.type) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    default:
      return "string"; // string, string[] both stored as string props
  }
}

/**
 * Build a BlockNote block spec from a registry directive.
 */
export function buildDirectiveBlockSpec(
  directive: RegistryDirective
): CLNDirectiveBlockSpec {
  const propSchema: Record<string, CLNPropDef> = {};

  // Map each registry attribute to a BlockNote prop
  for (const attr of directive.attributes) {
    // Skip align for table — it's encoded in tableData
    if (directive.name === "table" && attr.name === "align") {
      continue;
    }

    propSchema[attr.name] = {
      type: attrPropType(attr),
      default: attrDefault(attr),
    };
  }

  // Determine content model based on body_mode
  let content: "inline" | "none" | "table";
  if (directive.name === "table") {
    content = "table";
    // Table stores its cell data as a JSON-encoded prop
    propSchema["tableData"] = { type: "string", default: "[]" };
  } else if (directive.body_mode === "parsed") {
    content = "inline";
  } else {
    content = "none";
    // Raw-mode directives store their body text in a prop
    if (directive.body_mode === "raw") {
      propSchema["rawContent"] = { type: "string", default: "" };
    }
  }

  return {
    type: toBlockType(directive.name),
    propSchema,
    content,
    directiveName: directive.name,
    bodyMode: directive.body_mode as "parsed" | "raw" | "none",
    registryAttributes: directive.attributes,
  };
}

/**
 * Build block specs for all block-placement directives in the registry.
 */
export function buildAllDirectiveBlockSpecs(): Record<
  string,
  CLNDirectiveBlockSpec
> {
  const specs: Record<string, CLNDirectiveBlockSpec> = {};
  for (const directive of getBlockDirectives()) {
    const spec = buildDirectiveBlockSpec(directive);
    specs[spec.type] = spec;
  }
  return specs;
}

/** Pre-built directive block specs from the built-in registry. */
export const DIRECTIVE_BLOCK_SPECS = buildAllDirectiveBlockSpecs();
