/**
 * Build-time script: converts reference/builtin-registry.toml to a JSON
 * module that the editor can import directly. This runs during `pnpm build`
 * and `pnpm dev` (via a Vite plugin or pre-build script).
 *
 * Usage: npx tsx editor/scripts/convert-registry.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOML_PATH = join(__dirname, "..", "..", "reference", "builtin-registry.toml");
const OUTPUT_PATH = join(__dirname, "..", "src", "schema", "registry.json");

interface Attribute {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  allowed_values?: string[];
  cardinality?: string;
}

interface Directive {
  name: string;
  placement: string;
  body_mode: string;
  emits: string[];
  built_in: boolean;
  attributes: Attribute[];
}

interface Registry {
  spec: string;
  registry_kind: string;
  registry_source: string;
  directives: Directive[];
}

/**
 * Minimal TOML parser for the specific structure of builtin-registry.toml.
 * We avoid a full TOML dependency since the registry format is constrained.
 */
function parseRegistryToml(content: string): Registry {
  const lines = content.split("\n");
  const registry: Registry = {
    spec: "",
    registry_kind: "",
    registry_source: "",
    directives: [],
  };

  let currentDirective: Directive | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("#")) continue;

    // Top-level key-value pairs
    if (line.startsWith("spec")) {
      registry.spec = extractStringValue(line);
      continue;
    }
    if (line.startsWith("registry_kind")) {
      registry.registry_kind = extractStringValue(line);
      continue;
    }
    if (line.startsWith("registry_source")) {
      registry.registry_source = extractStringValue(line);
      continue;
    }

    // New directive section
    if (line === "[[directive]]") {
      if (currentDirective) {
        registry.directives.push(currentDirective);
      }
      currentDirective = {
        name: "",
        placement: "",
        body_mode: "",
        emits: [],
        built_in: true,
        attributes: [],
      };
      continue;
    }

    // Directive attribute section
    if (line === "[[directive.attribute]]") {
      if (!currentDirective) continue;
      currentDirective.attributes.push({
        name: "",
        type: "",
        required: false,
      });
      continue;
    }

    // Key-value inside a section
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const rawValue = line.slice(eqIdx + 1).trim();

    if (currentDirective && currentDirective.attributes.length > 0) {
      // We might be inside a [[directive.attribute]] or inside [[directive]]
      const lastAttr = currentDirective.attributes[currentDirective.attributes.length - 1];
      if (key === "name" && lastAttr.name === "") {
        lastAttr.name = extractStringValue(line);
        continue;
      }
      if (key === "type" && lastAttr.type === "") {
        lastAttr.type = extractStringValue(line);
        continue;
      }
      if (key === "required") {
        lastAttr.required = rawValue === "true";
        continue;
      }
      if (key === "default") {
        if (rawValue === "true") lastAttr.default = true;
        else if (rawValue === "false") lastAttr.default = false;
        else lastAttr.default = extractStringValue(line);
        continue;
      }
      if (key === "allowed_values") {
        lastAttr.allowed_values = extractArrayValue(rawValue);
        continue;
      }
      if (key === "cardinality") {
        lastAttr.cardinality = extractStringValue(line);
        continue;
      }
    }

    if (currentDirective) {
      if (key === "name") {
        currentDirective.name = extractStringValue(line);
      } else if (key === "placement") {
        currentDirective.placement = extractStringValue(line);
      } else if (key === "body_mode") {
        currentDirective.body_mode = extractStringValue(line);
      } else if (key === "emits") {
        currentDirective.emits = extractArrayValue(rawValue);
      } else if (key === "built_in") {
        currentDirective.built_in = rawValue === "true";
      }
    }
  }

  // Push last directive
  if (currentDirective) {
    registry.directives.push(currentDirective);
  }

  return registry;
}

function extractStringValue(line: string): string {
  const match = line.match(/"([^"]*)"/);
  return match ? match[1] : "";
}

function extractArrayValue(raw: string): string[] {
  const match = raw.match(/\[([^\]]*)\]/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim().replace(/^"/, "").replace(/"$/, ""))
    .filter((s) => s.length > 0);
}

// Main
const tomlContent = readFileSync(TOML_PATH, "utf-8");
const registry = parseRegistryToml(tomlContent);

// Validate
if (registry.directives.length === 0) {
  console.error("ERROR: No directives found in registry TOML");
  process.exit(1);
}

console.log(`Parsed ${registry.directives.length} directives:`);
for (const d of registry.directives) {
  console.log(`  ${d.name} (${d.placement}, ${d.body_mode}, ${d.attributes.length} attrs)`);
}

writeFileSync(OUTPUT_PATH, JSON.stringify(registry, null, 2) + "\n");
console.log(`\nWritten to ${OUTPUT_PATH}`);
