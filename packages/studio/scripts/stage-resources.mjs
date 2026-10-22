// Gathers what the packaged Studio ships beside the app (electron-builder
// `extraResources`, plan §14.5): the runtime, templates, the tutorial and
// samples, the spec (agent guide, llm-reference), and himawari-mcp bundled
// into one file for Claude apps to run (Mode A).
//
//   node packages/studio/scripts/stage-resources.mjs
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
for (const name of ["tutorial", "sunflower-demo", "festival-eve", "layered"]) {
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

// hwc and himawari-mcp as one standalone program (FINALIZATION.md OC-3): Node's single executable,
// so neither the Claude-app connection nor the command line needs Node installed.
const seaDir = join(studio, "build-resources-sea");
rmSync(seaDir, { recursive: true, force: true });
await build({
  configFile: false,
  logLevel: "warn",
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: join(studio, "scripts", "tools", "entry.mjs"),
    outDir: seaDir,
    emptyOutDir: true,
    minify: false,
    rolldownOptions: { output: { format: "es", entryFileNames: "tools.mjs", codeSplitting: false } },
  },
});
writeFileSync(
  join(seaDir, "sea.json"),
  JSON.stringify({ main: join(studio, "scripts", "tools", "sea-main.cjs"), output: join(seaDir, "sea.blob"), disableExperimentalSEAWarning: true, assets: { "tools.mjs": join(seaDir, "tools.mjs") } }),
);
execFileSync(process.execPath, ["--experimental-sea-config", join(seaDir, "sea.json")], { stdio: "inherit" });
mkdirSync(join(out, "tools"));
const exe = join(out, "tools", "himawari-tools.exe");
cpSync(process.execPath, exe);
const { inject } = await import("postject");
await inject(exe, "NODE_SEA_BLOB", readFileSync(join(seaDir, "sea.blob")), { sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2", overwrite: true });
rmSync(seaDir, { recursive: true, force: true });
// The program must start (a bundling mistake shows up here, not on a user's PC).
const help = execFileSync(exe, ["--help"], { encoding: "utf8" });
if (!help.includes("Usage: hwc")) throw new Error(`himawari-tools.exe didn't start properly:\n${help}`);
// `hwc` in a terminal, once the user lets Studio add this folder to their PATH (Settings → Advanced).
writeFileSync(join(out, "tools", "hwc.cmd"), '@"%~dp0himawari-tools.exe" %*\r\n');

console.log(`✓ staged ${out}`);
