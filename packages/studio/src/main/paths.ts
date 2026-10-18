/** Where Studio finds what it ships with: templates, the tutorial project, and the runtime. */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { app } from "electron";
import type { BundledProject } from "../shared/api.js";

/** In a checkout: the repository root (out/main → packages/studio/out/main). */
function repoRoot(): string {
  return resolve(import.meta.dirname, "../../../..");
}

/** Bundled resources (electron-builder `extraResources`), or the checkout in development. */
export function resources(): { templates: string; spec: string; projects: Record<BundledProject, string>; runtime: string | null } {
  if (app.isPackaged) {
    const r = process.resourcesPath;
    const exe = join(r, "runtime", "himawari.exe");
    return { templates: join(r, "templates"), spec: join(r, "spec"), projects: bundled(join(r, "examples")), runtime: existsSync(exe) ? exe : null };
  }
  const root = repoRoot();
  const env = process.env["HIMAWARI_RUNTIME"];
  let runtime: string | null = env && existsSync(env) ? env : null;
  for (const preset of ["win64-release", "win64-debug"]) {
    const exe = join(root, "runtime", "build", preset, "himawari.exe");
    if (!runtime && existsSync(exe)) runtime = exe;
  }
  return { templates: join(root, "templates"), spec: join(root, "spec"), projects: bundled(join(root, "examples")), runtime };
}

function bundled(examples: string): Record<BundledProject, string> {
  return {
    tutorial: join(examples, "tutorial"),
    "sunflower-demo": join(examples, "sunflower-demo"),
    "festival-eve": join(examples, "festival-eve"),
    layered: join(examples, "layered"),
  };
}

/** The renderer's built files (production). */
export function rendererDir(): string {
  return resolve(import.meta.dirname, "../renderer");
}

export function preloadPath(): string {
  return resolve(import.meta.dirname, "../preload/index.cjs");
}
