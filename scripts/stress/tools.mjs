// Times every AI tool (the registry MCP and Studio's assistant share) on a big project,
// such as one from make-project.mjs. Writes go to a copy, never the original.
//
//   node scripts/stress/tools.mjs <project folder>
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tools = await import(new URL("../../packages/tools/dist/index.js", import.meta.url).href);
const { findRuntime } = await import(new URL("../../packages/tools/dist/runtime.js", import.meta.url).href);
const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/stress/tools.mjs <project folder>");
  process.exit(2);
}
const dir = mkdtempSync(join(tmpdir(), "hw-tools-"));
cpSync(src, dir, { recursive: true, filter: (s) => !s.endsWith("build") });
const ctx = { fs: new tools.ProjectFs(dir), runtime: findRuntime(), allowBuild: true, confirmed: true };
const byName = new Map(tools.TOOLS.map((t) => [t.name, t]));

async function time(name, args) {
  const t = byName.get(name);
  const t0 = performance.now();
  try {
    const out = await t.run(ctx, t.input.parse(args));
    const ms = performance.now() - t0;
    const text = (out.text ?? JSON.stringify(out)).split("\n")[0].slice(0, 110);
    console.log(`${String(Math.round(ms)).padStart(6)} ms  ${name.padEnd(18)} ${text}  (${(out.text ?? "").length} chars)`);
    return out;
  } catch (e) {
    console.log(`${String(Math.round(performance.now() - t0)).padStart(6)} ms  ${name.padEnd(18)} ERROR ${e.message.slice(0, 160)}`);
    return null;
  }
}

await time("project_info", {});
await time("list_scenes", {});
await time("list_characters", {});
await time("list_variables", {});
await time("list_assets", {});
await time("get_character", { id: "c03" });
await time("search_dialogue", { query: "lantern" });
await time("search_dialogue", { query: "promise", speaker: "c05" });
await time("read_scene", { scene: "r7_f5_s3" });
await time("read_scene", { scene: "big_149" });
await time("get_story_graph", { format: "mermaid" });
await time("validate", {});
await time("analyze", {});
const scene = await time("read_scene", { scene: "r2_f1_s1" });
const id = /#line:(\w{6})/.exec(scene?.text ?? "")?.[1];
await time("patch_scene", { scene: "r2_f1_s1", base_revision: scene?.data?.revision, ops: [{ op: "replace_text", lineId: id, text: "Edited by the stress test." }], rationale: "stress" });
await time("set_translation", { id, lang: "ja", text: "ストレステスト。", rationale: "stress" });
await time("declare_variable", { name: "stress_var", type: "int", default: 0, rationale: "stress" });
await time("rename", { kind: "character", from: "c11", to: "c11b", rationale: "stress" });
await time("playtest", {});
await time("render_line", { line_id: id });
rmSync(dir, { recursive: true, force: true });
