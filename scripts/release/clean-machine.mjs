// The clean-machine test (FINALIZATION.md §11.5): a fresh Windows Sandbox with no network, no Node,
// no developer tools. It installs Studio from the installer, then, with only what the installer
// brought, builds a sample game and plays it a few frames, and writes a report.
//
//   node scripts/release/clean-machine.mjs
//
// Needs Windows Sandbox (Windows 11 Pro: "Windows Sandbox" in Windows Features) and a packaged
// installer (corepack pnpm --filter @himawari/studio package). Results land in
// scripts/release/out/clean-machine/report.txt (and game.png, the game's first frames).
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const release = join(repo, "packages", "studio", "release");
const setup = existsSync(release) ? readdirSync(release).find((f) => /^Himawari-Studio-Setup-.*\.exe$/.test(f)) : undefined;
if (!setup) {
  console.error("✗ no installer in packages/studio/release: run corepack pnpm --filter @himawari/studio package first");
  process.exit(1);
}
const input = join(here, "out", "clean-machine-in");
const output = join(here, "out", "clean-machine");
rmSync(input, { recursive: true, force: true });
rmSync(output, { recursive: true, force: true });
mkdirSync(input, { recursive: true });
mkdirSync(output, { recursive: true });
copyFileSync(join(release, setup), join(input, "setup.exe"));
copyFileSync(join(here, "inside-sandbox.ps1"), join(input, "inside-sandbox.ps1"));

const box = "C:\\Users\\WDAGUtilityAccount\\Desktop";
const wsb = `<Configuration>
  <Networking>Disable</Networking>
  <vGPU>Disable</vGPU>
  <MappedFolders>
    <MappedFolder><HostFolder>${input}</HostFolder><SandboxFolder>${box}\\in</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
    <MappedFolder><HostFolder>${output}</HostFolder><SandboxFolder>${box}\\out</SandboxFolder><ReadOnly>false</ReadOnly></MappedFolder>
  </MappedFolders>
  <LogonCommand><Command>powershell.exe -ExecutionPolicy Bypass -File ${box}\\in\\inside-sandbox.ps1</Command></LogonCommand>
</Configuration>
`;
const wsbFile = join(here, "out", "clean-machine.wsb");
writeFileSync(wsbFile, wsb);
console.log(`Starting Windows Sandbox (networking and the GPU off). The report appears in ${output}\\report.txt; close the Sandbox window when it says "done".`);
execFileSync("cmd.exe", ["/c", "start", "", wsbFile]);
