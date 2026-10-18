/**
 * Running the bundled runtime (plan §10.2 rule 6): only `himawari.exe`, only
 * with fixed arguments, never a shell. Used by `playtest`, `render_line`, and
 * `hwc run`/`playtest`.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where himawari.exe is: $HIMAWARI_RUNTIME, else runtime/himawari.exe in an
 * installed Studio's resources, else in a Himawari checkout
 * (runtime/build/win64-release, then win64-debug), else null.
 */
export function findRuntime(): string | null {
  const env = process.env["HIMAWARI_RUNTIME"];
  if (env && existsSync(env)) return resolve(env);
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    // Installed with Studio: resources/runtime/himawari.exe beside resources/mcp/.
    const installed = join(dir, "runtime", "himawari.exe");
    if (existsSync(installed)) return installed;
    for (const preset of ["win64-release", "win64-debug"]) {
      const exe = join(dir, "runtime", "build", preset, "himawari.exe");
      if (existsSync(exe)) return exe;
    }
    dir = dirname(dir);
  }
  return null;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the runtime with an argument list (no shell); kills it after `timeoutMs`. */
export function runRuntime(exe: string, args: readonly string[], timeoutMs = 60000, env: Record<string, string> = {}): Promise<RunResult> {
  return new Promise((done, fail) => {
    const child = spawn(exe, [...args], { shell: false, windowsHide: true, env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      fail(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code: code ?? -1, stdout, stderr });
    });
  });
}
