export interface DirectiveSpec {
  name: string;
  placement: string;
  body_mode: "parsed" | "raw" | "none";
  attributes: Array<{
    name: string;
    type: string;
    required: boolean;
    default?: unknown;
    allowed_values?: string[];
  }>;
}

export const BUILTIN_DIRECTIVES: DirectiveSpec[] = [
  { name: "callout", placement: "block", body_mode: "parsed", attributes: [
    { name: "kind", type: "string", required: true, allowed_values: ["info", "warning", "danger", "tip"] },
    { name: "title", type: "string", required: false },
    { name: "compact", type: "boolean", required: false, default: false },
  ]},
  { name: "figure", placement: "block", body_mode: "parsed", attributes: [
    { name: "src", type: "string", required: true },
  ]},
  { name: "math", placement: "block", body_mode: "raw", attributes: [] },
  { name: "table", placement: "block", body_mode: "raw", attributes: [
    { name: "header", type: "boolean", required: false, default: false },
    { name: "align", type: "string[]", required: false, allowed_values: ["left", "center", "right"] },
  ]},
  { name: "source", placement: "block", body_mode: "raw", attributes: [
    { name: "language", type: "string", required: true },
  ]},
  { name: "toc", placement: "block", body_mode: "none", attributes: [] },
  { name: "anchor", placement: "block", body_mode: "none", attributes: [
    { name: "id", type: "string", required: true },
  ]},
  { name: "include", placement: "block", body_mode: "none", attributes: [
    { name: "src", type: "string", required: true },
  ]},
];

export function logResult(msg: string) {
  const el = document.getElementById("results");
  if (el) el.textContent += msg + "\n";
}
