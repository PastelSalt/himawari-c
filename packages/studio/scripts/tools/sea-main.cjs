/* eslint-disable @typescript-eslint/no-require-imports -- Node single executables start in CommonJS. */
// The standalone program's start (Node single executable, FINALIZATION.md OC-3). Node's SEA runs CommonJS,
// so the bundled ESM program travels as an asset, is written once to a cache folder, and imported from there.
// Studio's own resources (runtime, templates, spec) sit beside this exe's folder.
const { getAsset } = require("node:sea");
const { createHash } = require("node:crypto");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { tmpdir } = require("node:os");
const { pathToFileURL } = require("node:url");

const resources = dirname(dirname(process.execPath));
const env = process.env;
env.HIMAWARI_TOOLS_EXE ??= process.execPath;
env.HIMAWARI_SPEC_DIR ??= join(resources, "spec");
env.HWC_TEMPLATES ??= join(resources, "templates");
if (!env.HIMAWARI_RUNTIME && existsSync(join(resources, "runtime", "himawari.exe"))) env.HIMAWARI_RUNTIME = join(resources, "runtime", "himawari.exe");

const code = Buffer.from(getAsset("tools.mjs"));
const dir = join(env.LOCALAPPDATA ?? tmpdir(), "Himawari", "tools", createHash("sha256").update(code).digest("hex").slice(0, 16));
const file = join(dir, "tools.mjs");
if (!existsSync(file)) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, code);
}
import(pathToFileURL(file).href).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
