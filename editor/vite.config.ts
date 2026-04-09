import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/clear-notation/editor/",
  root: ".",
  build: { outDir: "dist" },
  plugins: [react()],
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["web-tree-sitter"],
  },
});
