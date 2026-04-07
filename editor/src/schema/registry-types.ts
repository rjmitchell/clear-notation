/**
 * TypeScript types and accessors for the ClearNotation directive registry.
 *
 * The registry is loaded from the build-time generated registry.json,
 * which is converted from reference/builtin-registry.toml.
 */

import registryData from "./registry.json";

/** An attribute specification for a directive. */
export interface RegistryAttribute {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  allowed_values?: string[];
  cardinality?: string;
}

/** A directive specification from the registry. */
export interface RegistryDirective {
  name: string;
  placement: "block" | "inline";
  body_mode: "parsed" | "raw" | "none";
  emits: string[];
  built_in: boolean;
  attributes: RegistryAttribute[];
}

/** The full registry structure. */
export interface Registry {
  spec: string;
  registry_kind: string;
  registry_source: string;
  directives: RegistryDirective[];
}

/** Load the built-in registry. */
export function loadRegistry(): Registry {
  return registryData as Registry;
}

/** Get all block-placement directives. */
export function getBlockDirectives(): RegistryDirective[] {
  return loadRegistry().directives.filter((d) => d.placement === "block");
}

/** Get all inline-placement directives. */
export function getInlineDirectives(): RegistryDirective[] {
  return loadRegistry().directives.filter((d) => d.placement === "inline");
}

/** Get block directives with body_mode="parsed" (content is nested blocks). */
export function getParsedModeDirectives(): RegistryDirective[] {
  return getBlockDirectives().filter((d) => d.body_mode === "parsed");
}

/** Get block directives with body_mode="raw" (content is verbatim text). */
export function getRawModeDirectives(): RegistryDirective[] {
  return getBlockDirectives().filter((d) => d.body_mode === "raw");
}

/** Get block directives with body_mode="none" (no body). */
export function getNoneModeDirectives(): RegistryDirective[] {
  return getBlockDirectives().filter((d) => d.body_mode === "none");
}
