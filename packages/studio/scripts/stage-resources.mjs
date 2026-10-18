// Gathers what the packaged Studio ships beside the app (electron-builder
// `extraResources`, plan §14.5): the runtime, templates, the tutorial and
// samples, the spec (agent guide, llm-reference), and himawari-mcp bundled
// into one file for Claude apps to run (Mode A).
//
//   node packages/studio/scripts/stage-resources.mjs
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const studio = fileURLToPath(new URL("..", import.meta.url));
const repo = join(studio, "..", "..");
const out = join(studio, "build-resources");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const runtime = join(repo, "runtime", "build", "win64-release", "himawari.exe");
if (!existsSync(runtime)) {
  console.error("✗ runtime/build/win64-release/himawari.exe is missing: build the runtime first (cmake --build --preset win64-release)");
  process.exit(1);
}
mkdirSync(join(out, "runtime"));
cpSync(runtime, join(out, "runtime", "himawari.exe"));

const skip = (src) => !["build", "cache", "node_modules", ".git"].includes(basename(src)) && !src.endsWith("session.json");
cpSync(join(repo, "templates"), join(out, "templates"), { recursive: true, filter: skip });
for (const name of ["tutorial", "festival-eve", "layered"]) {
  cpSync(join(repo, "examples", name), join(out, "examples", name), { recursive: true, filter: skip });
}
cpSync(join(repo, "spec"), join(out, "spec"), { recursive: true });

// himawari-mcp as one ESM file (Node 20+), so `node himawari-mcp.mjs --project …` needs no install.
await build({
  configFile: false,
  logLevel: "warn",
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: join(repo, "packages", "mcp", "dist", "main.js"),
    outDir: join(out, "mcp"),
    emptyOutDir: true,
    minify: false,
    rolldownOptions: { output: { format: "es", entryFileNames: "himawari-mcp.mjs" } },
  },
});

console.log(`✓ staged ${out}`);
