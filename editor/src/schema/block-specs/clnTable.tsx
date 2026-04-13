/**
 * clnTable — visual table block rendered from tableData prop.
 *
 * Source form: ::table[header=true, align=["left","right"]]{
 *   Col A | Col B
 *   1     | 2
 * }
 *
 * The converter stores the parsed 2D cell array as a JSON string in
 * props.tableData. This block spec deserializes it and renders a
 * read-only HTML table. Editing happens in the source pane.
 */

import { createBlockConfig, createBlockSpec } from "@blocknote/core";

const createClnTableBlockConfig = createBlockConfig(() => ({
  type: "clnTable" as const,
  propSchema: {
    header: { default: false },
    tableData: { default: "[]" as string },
    align: { default: "" as string },
  },
  content: "none" as const,
}));

const createClnTableBlockSpec = createBlockSpec(
  createClnTableBlockConfig,
  () => ({
    render(block) {
      const container = document.createElement("div");
      container.className = "cln-table-wrapper";
      container.contentEditable = "false";
      container.style.margin = "4px 0";

      let rows: string[][] = [];
      try {
        rows = JSON.parse(block.props.tableData as string);
      } catch {
        rows = [];
      }

      const alignments = (block.props.align as string)
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);

      if (rows.length === 0) {
        container.textContent = "Empty table";
        container.style.color = "var(--cn-muted)";
        container.style.fontStyle = "italic";
        container.style.padding = "8px";
        return { dom: container };
      }

      const table = document.createElement("table");
      table.className = "cln-table";
      Object.assign(table.style, {
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "0.9em",
        fontFamily: "var(--cn-font-body, system-ui)",
      });

      const headerRow = block.props.header ? rows[0] : null;
      const bodyRows = block.props.header ? rows.slice(1) : rows;

      if (headerRow) {
        const thead = document.createElement("thead");
        const tr = document.createElement("tr");
        headerRow.forEach((cell, i) => {
          const th = document.createElement("th");
          th.textContent = cell;
          Object.assign(th.style, {
            textAlign: alignments[i] || "left",
            padding: "6px 12px",
            borderBottom: "2px solid var(--cn-border)",
            fontWeight: "600",
            whiteSpace: "nowrap",
          });
          tr.appendChild(th);
        });
        thead.appendChild(tr);
        table.appendChild(thead);
      }

      const tbody = document.createElement("tbody");
      bodyRows.forEach((row) => {
        const tr = document.createElement("tr");
        row.forEach((cell, ci) => {
          const td = document.createElement("td");
          td.textContent = cell;
          Object.assign(td.style, {
            textAlign: alignments[ci] || "left",
            padding: "6px 12px",
            borderBottom: "1px solid var(--cn-border)",
          });
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      container.appendChild(table);

      return { dom: container };
    },
  }),
);

export const clnTableSpec = createClnTableBlockSpec();
