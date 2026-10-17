/**
 * End to end: the real stdio server (dist/main.js) on a temporary copy of a
 * project, driven by the official v2 client, as Claude Code or the desktop
 * app would.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MAIN = join(ROOT, "packages/mcp/dist/main.js");

let dir = "";
let client: Client;
let elicitations = 0;

type ToolResult = { content: { type: string; text?: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as ToolResult;
const textOf = (r: ToolResult) => r.content.map((c) => c.text ?? "").join("\n");

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "himawari-mcp-"));
  cpSync(join(ROOT, "tests/conformance/cases/basic"), dir, { recursive: true });
  rmSync(join(dir, "expected.hwb"));
  client = new Client({ name: "test", version: "0.0.0" }, { capabilities: { elicitation: {} } });
  client.setRequestHandler("elicitation/create", async () => {
    elicitations++;
    return { action: "accept", content: { confirm: true } };
  });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [MAIN, "--project", dir], stderr: "ignore" }));
}, 30000);

afterAll(async () => {
  await client?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("himawari-mcp", () => {
  test("lists every tool in a fixed order, with annotations and output schemas", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "project_info", "list_scenes", "read_scene", "search_dialogue", "get_story_graph", "list_characters", "get_character",
      "list_variables", "list_assets", "validate", "analyze", "create_scene", "update_scene", "patch_scene", "upsert_character",
      "set_preset", "declare_variable", "rename", "set_translation", "playtest", "render_line", "build",
    ]);
    const read = tools.find((t) => t.name === "read_scene");
    expect(read?.annotations?.readOnlyHint).toBe(true);
    expect(read?.outputSchema).toBeDefined();
    expect(tools.find((t) => t.name === "update_scene")?.annotations?.destructiveHint).toBe(true);
  });

  test("publishes the agent guide as instructions", () => {
    const instructions = client.getInstructions() ?? "";
    expect(instructions).toContain("Never generate");
    expect(instructions).toContain("line IDs");
  });

  test("project_info and read tools", async () => {
    const info = await call("project_info");
    expect(info.structuredContent?.["entry"]).toBe("ch1_intro");
    const scenes = await call("list_scenes");
    expect((scenes.structuredContent?.["scenes"] as unknown[]).length).toBe(6);
    const graph = await call("get_story_graph", { format: "mermaid" });
    expect(textOf(graph)).toContain("flowchart TD");
    const hana = await call("get_character", { id: "hana" });
    expect(textOf(hana)).toContain("Must never");
    const search = await call("search_dialogue", { query: "festival" });
    expect(search.structuredContent?.["total"]).toBe(1); // the option "The festival."
    const missing = await call("read_scene", { scene: "nope" });
    expect(missing.isError).toBe(true);
  });

  test("patch_scene edits by line ID, checks the revision, and stamps provenance", async () => {
    const scene = await call("read_scene", { scene: "talk_festival" });
    const revision = scene.structuredContent?.["revision"] as string;
    const ok = await call("patch_scene", {
      scene: "talk_festival",
      base_revision: revision,
      ops: [
        { op: "replace_text", lineId: "z4a5b6", text: "It's next Saturday!" },
        { op: "insert_after", lineId: "z4a5b6", hws: 'hana smile "You should come."' },
      ],
    });
    expect(ok.isError).toBeFalsy();
    expect(ok.structuredContent?.["applied"]).toBe(true);
    const added = ok.structuredContent?.["lineIds"] as string[];
    expect(added).toHaveLength(1);
    const file = readFileSync(join(dir, "script/ch1.hws"), "utf8");
    expect(file).toContain('hana "It\'s next Saturday!"   #line:z4a5b6');
    expect(file).toContain(`hana smile "You should come."   #line:${added[0]}`);
    const prov = JSON.parse(readFileSync(join(dir, ".himawari/provenance.json"), "utf8")) as { lines: Record<string, { provenance: string }> };
    expect(prov.lines[added[0] as string]?.provenance).toBe("ai");
    expect(prov.lines["z4a5b6"]?.provenance).toBe("ai-edited");

    const stale = await call("patch_scene", { scene: "talk_festival", base_revision: revision, ops: [{ op: "delete", lineIds: ["z4a5b6"] }] });
    expect(stale.isError).toBe(true);
    expect(textOf(stale)).toContain("changed since");
    const foreign = await call("patch_scene", { scene: "talk_festival", ops: [{ op: "delete", lineIds: ["k3f9a1"] }] });
    expect(foreign.isError).toBe(true);
  });

  test("writes that add errors are refused and nothing is written; dry runs write nothing", async () => {
    const bad = await call("create_scene", { hws: 'scene ch2:\n    hana "Hi."\n    jump nowhere\n' });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toContain("HW0208");
    expect(existsSync(join(dir, "script/ch2.hws"))).toBe(false);
    const dry = await call("create_scene", { hws: 'scene ch2:\n    hana "Hi."\n    end\n', dry_run: true });
    expect(dry.isError).toBeFalsy();
    expect(dry.structuredContent?.["applied"]).toBe(false);
    expect(existsSync(join(dir, "script/ch2.hws"))).toBe(false);
    const real = await call("create_scene", { hws: 'scene ch2:\n    hana "Hi."\n    end\n' });
    expect(real.structuredContent?.["applied"]).toBe(true);
    expect(readFileSync(join(dir, "script/ch2.hws"), "utf8")).toMatch(/hana "Hi\."   #line:[0-9a-z]{6}/);
  });

  test("variables, characters, presets, translations", async () => {
    expect((await call("declare_variable", { name: "trust", type: "int", default: 0 })).structuredContent?.["applied"]).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, "himawari.json"), "utf8")).variables.trust).toEqual({ type: "int", default: 0, scope: "save" });
    const mio = await call("upsert_character", { id: "mio", name: { en: "Mio", ja: "澪" }, color: "#e6467a", bible: "## Personality\nQuiet.\n\n## Must never\nShout." });
    expect(mio.structuredContent?.["applied"]).toBe(true);
    expect(readFileSync(join(dir, "characters/mio.md"), "utf8")).toContain("Must never");
    expect((await call("set_preset", { character: "hana", preset: "sleepy", layers: { eyes: "half", mouth: "neutral" } })).structuredContent?.["applied"]).toBe(true);
    // basic is English-only; add Japanese, then translate.
    const m = JSON.parse(readFileSync(join(dir, "himawari.json"), "utf8"));
    m.languages = ["en", "ja"];
    writeFileSync(join(dir, "himawari.json"), JSON.stringify(m, null, 2));
    const broken = await call("set_translation", { lang: "ja", id: "k3f9a1", text: "おはよう！" });
    expect(broken.isError).toBe(true); // dropped [player_name] and {b}
    const good = await call("set_translation", { lang: "ja", id: "k3f9a1", text: "おはよう、[player_name]！また{b}遅刻{/b}？" });
    expect(good.structuredContent?.["applied"]).toBe(true);
    const table = JSON.parse(readFileSync(join(dir, "locales/ja.json"), "utf8")) as { lines: { id: string; status: string }[] };
    expect(table.lines.find((l) => l.id === "k3f9a1")?.status).toBe("needs-review");
  });

  test("a rename across more than three files asks the user first (MRTR), then applies", async () => {
    for (const n of [3, 4, 5]) writeFileSync(join(dir, `script/extra${n}.hws`), `scene extra${n}:\n    jump ch1_hub\n`);
    const before = elicitations;
    const r = await call("rename", { kind: "scene", from: "ch1_hub", to: "hub" });
    expect(elicitations).toBe(before + 1);
    expect(r.structuredContent?.["applied"]).toBe(true);
    expect(readFileSync(join(dir, "script/extra4.hws"), "utf8")).toContain("jump hub");
    expect(readFileSync(join(dir, "script/ch1.hws"), "utf8")).toContain("scene hub:");
    expect((await call("validate")).structuredContent?.["errors"]).toBe(0);
  });

  test("the sandbox refuses paths outside the project", async () => {
    const r = await call("create_scene", { hws: "scene evil:\n    end\n", file: "script/../../evil.hws" });
    expect(r.isError).toBe(true);
  });

  test("resources and prompts", async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain("himawari://agent-guide");
    expect(uris).toContain("himawari://spec/llm-reference");
    expect(uris).toContain("himawari://scene/ch1_intro");
    const scene = await client.readResource({ uri: "himawari://scene/ch1_intro" });
    expect(JSON.stringify(scene.contents)).toContain("scene ch1_intro:");
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(["write_scene", "continuity_check", "branch_planner", "translate_scene", "sprite_direction"]);
    const p = await client.getPrompt({ name: "translate_scene", arguments: { scene: "ch1_intro", lang: "ja" } });
    expect(JSON.stringify(p.messages)).toContain("set_translation");
  });

  test("errors the project already had don't block a write; scenes that jump to each other are created together", async () => {
    writeFileSync(join(dir, "script/broken.hws"), "scene broken:\n    jump nowhere_yet\n");
    const ok = await call("declare_variable", { name: "mood", type: "int", default: 0 });
    expect(ok.structuredContent?.["applied"]).toBe(true); // HW0208 in broken.hws was already there
    const pair = await call("create_scene", { hws: 'scene ping:\n    "Ping."\n    jump pong\n\nscene pong:\n    "Pong."\n    jump ping\n' });
    expect(pair.isError).toBeFalsy();
    expect(pair.structuredContent?.["scenes"]).toEqual(["ping", "pong"]);
    rmSync(join(dir, "script/broken.hws"));
  });

  test("build is off unless the user allowed it", async () => {
    const r = await call("build");
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("--allow-build");
  });
});
