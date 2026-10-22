import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

// Everything is bundled (the packaged app ships no node_modules), so all
// dependencies are devDependencies and externalizing is off.
export default defineConfig({
  main: {
    build: { externalizeDeps: false },
  },
  preload: {
    build: {
      externalizeDeps: false,
      // A sandboxed preload must be a single CommonJS script.
      rolldownOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, "src/renderer"),
    plugins: [react()],
    resolve: { alias: { "@locales": resolve(import.meta.dirname, "locales") } },
    build: { rolldownOptions: { input: resolve(import.meta.dirname, "src/renderer/index.html") } },
  },
});
