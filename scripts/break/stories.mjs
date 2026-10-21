#!/usr/bin/env node
/**
 * Generated stories, played for real (BREAK_IT.md E-12 to E-16).
 *
 *   node scripts/break/stories.mjs [--count 200] [--seed 1]
 *
 * Writes random but valid projects (scenes, menus with `once` and conditions,
 * variables of every type, rand(), calls and returns, guarded loops, NVL,
 * stage directions, text markup), checks each with Core, then:
 *  - E-12: the runtime's playtest explores every path: no crash, no VM error;
 *  - E-13 to E-15: test_saveany saves and rolls back at every line, and loads
 *    every save into an edited version of the story;
 *  - E-16: data.hwp plus a patch plays exactly like a fresh full build.
 * Uses the ASan builds when they exist (win64-asan), so memory errors show.
 * Output and any failing story go to runtime/build/break/stories/.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProject, compile, format, writeHwb } from "../../packages/core/dist/index.js";
import { ProjectFs, compileProject, packageGame } from "../../packages/tools/dist/index.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : dflt;
};
const COUNT = arg("--count", 200);
const SEED = arg("--seed", 1);
const OUT = join(ROOT, "runtime", "build", "break", "stories");
const pickBuild = (exe) => ["win64-asan", "win64-debug"].map((p) => join(ROOT, "runtime", "build", p, exe)).find((p) => existsSync(p));
const RUNTIME = pickBuild("himawari.exe");
const SAVEANY = pickBuild("test_saveany.exe");
const RELEASE_RUNTIME = join(ROOT, "runtime", "build", "win64-release", "himawari.exe");
const env = { ...process.env, PATH: `C:\\msys64\\clang64\\bin;${process.env.PATH}` };
if (!RUNTIME || !SAVEANY) {
  console.error("Build the runtime first (win64-asan or win64-debug).");
  process.exit(1);
}

/** A small seeded random source (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n) => Math.floor(next() * n), pick: (xs) => xs[Math.floor(next() * xs.length)], chance: (p) => next() < p };
}

const WORDS = ["lantern", "river", "summer", "promise", "glue", "festival", "quiet", "sunflower", "bell", "fireworks", "maybe", "tomorrow", "雨", "夏祭り", "ありがとう"];
const MOODS = ["calm", "happy", "sad"];

function generate(seed) {
  const r = rng(seed);
  const sceneCount = 3 + r.int(6);
  const subCount = r.int(3);
  const ints = ["c0", "c1", "c2"];
  const bools = ["f0", "f1"];
  const scenes = Array.from({ length: sceneCount }, (_, i) => (i === 0 ? "start" : `s${i}`));
  const subs = Array.from({ length: subCount }, (_, i) => `sub${i}`);
  const ind = (d) => "    ".repeat(d);

  const text = () => {
    let t = Array.from({ length: 2 + r.int(6) }, () => r.pick(WORDS)).join(" ");
    if (r.chance(0.3)) t += ` [${r.pick([...ints, ...bools, "mood"])}]`;
    if (r.chance(0.15)) t = `{b}${t}{/b}`;
    if (r.chance(0.1)) t += "{w=200} and then";
    if (r.chance(0.1)) t = `{shake}${t}{/shake}`;
    return t.replace(/"/g, "'");
  };
  const intExpr = () => r.pick([() => `${r.int(5)}`, () => r.pick(ints), () => `${r.pick(ints)} + ${1 + r.int(3)}`, () => `rand(${2 + r.int(5)})`, () => `${r.pick(ints)} * 2 - 1`])();
  const cond = () =>
    r.pick([
      () => `${r.pick(ints)} ${r.pick([">", ">=", "<", "==", "!="])} ${r.int(4)}`,
      () => r.pick(bools),
      () => `not ${r.pick(bools)}`,
      () => `mood == "${r.pick(MOODS)}"`,
      () => `${r.pick(bools)} and ${r.pick(ints)} > ${r.int(3)}`,
      () => `${r.pick(bools)} or mood != "${r.pick(MOODS)}"`,
    ])();
  const assign = () =>
    r.pick([
      () => `$ ${r.pick(ints)} = ${intExpr()}`,
      () => `$ ${r.pick(ints)} += ${1 + r.int(3)}`,
      () => `$ ${r.pick(bools)} = ${r.pick(["true", "false", `not ${r.pick(bools)}`])}`,
      () => `$ mood = "${r.pick(MOODS)}"`,
    ])();
  const stage = () =>
    r.pick([
      () => `bg ${r.pick(["park", "river", "school"])} with fade`,
      () => `show ${r.pick(["hana", "kai"])} at ${r.pick(["left", "center", "right"])}`,
      () => `hide ${r.pick(["hana", "kai"])}`,
      () => `music theme fade(500)`,
      () => `wait(${100 * (1 + r.int(5))})`,
      () => `textbox ${r.pick(["nvl", "adv"])}`,
      () => `shake`,
      () => `flash`,
    ])();

  /** Statements at depth `d`; `here` is the scene's index (jumps only go forward, so stories end). */
  function body(d, here, budget) {
    const lines = [];
    const n = 2 + r.int(5);
    for (let i = 0; i < n && budget.left-- > 0; i++) {
      const kind = r.int(10);
      if (kind <= 2) lines.push(`${ind(d)}${r.pick(["hana", "kai"])} "${text()}"`);
      else if (kind === 3) lines.push(`${ind(d)}"${text()}"`);
      else if (kind === 4) lines.push(`${ind(d)}${assign()}`);
      else if (kind === 5) lines.push(`${ind(d)}${stage()}`);
      else if (kind === 6 && d < 4) {
        lines.push(`${ind(d)}if ${cond()}:`, ...body(d + 1, here, budget));
        if (r.chance(0.4)) lines.push(`${ind(d)}elif ${cond()}:`, ...body(d + 1, here, budget));
        if (r.chance(0.5)) lines.push(`${ind(d)}else:`, ...body(d + 1, here, budget));
      } else if (kind === 7 && d < 3) {
        lines.push(`${ind(d)}menu${r.chance(0.5) ? ` "${text()}"` : ""}:`);
        const opts = 2 + r.int(2);
        for (let o = 0; o < opts; o++) {
          // The last option is always available, so a menu never runs out of choices.
          const guard = o < opts - 1 && r.chance(0.3) ? ` if ${cond()}` : "";
          const once = o < opts - 1 && r.chance(0.3) ? "once " : "";
          lines.push(`${ind(d + 1)}${once}"${text()} ${o}"${guard}:`, ...body(d + 2, here, budget));
          if (here + 1 < sceneCount && r.chance(0.3)) lines.push(`${ind(d + 2)}jump ${scenes[here + 1 + r.int(sceneCount - here - 1)]}`);
        }
      } else if (kind === 8 && subs.length) lines.push(`${ind(d)}call ${r.pick(subs)}`);
      else lines.push(`${ind(d)}"${text()}"`);
    }
    if (lines.length === 0) lines.push(`${ind(d)}"${text()}"`);
    return lines;
  }

  const out = [];
  scenes.forEach((name, i) => {
    out.push(`scene ${name}:`, ...body(1, i, { left: 30 }));
    // A guarded loop back now and then: at most two extra laps.
    if (i > 0 && r.chance(0.3)) out.push("    if loops < 2:", "        $ loops += 1", `        jump ${scenes[r.int(i)]}`);
    out.push(i + 1 < sceneCount ? `    jump ${scenes[i + 1 + r.int(sceneCount - i - 1)]}` : "    $ seen_end += 1", ...(i + 1 < sceneCount ? [] : ["    end"]), "");
  });
  // Subroutines only call later subroutines, so calls end too.
  subs.forEach((name, i) => {
    // A call that could loop back becomes a plain line (removing it could empty a block).
    const b = body(1, sceneCount, { left: 8 }).map((l) => (/^\s*call /.test(l) && !(i + 1 < subCount && l.includes(`sub${i + 1}`)) ? l.replace(/call \w+/, '"(no call)"') : l));
    out.push(`scene ${name}:`, ...b, "    return", "");
  });

  const manifest = {
    name: `Story ${seed}`,
    id: `dev.moekoworks.break.story${seed}`,
    version: "1.0.0",
    engine: "^1.0.0",
    entry: "start",
    sourceLanguage: "en",
    languages: ["en"],
    variables: {
      ...Object.fromEntries(ints.map((v) => [v, { type: "int", default: r.int(3), scope: "save" }])),
      ...Object.fromEntries(bools.map((v) => [v, { type: "bool", default: r.chance(0.5), scope: "save" }])),
      mood: { type: "str", enum: MOODS, default: "calm", scope: "save" },
      loops: { type: "int", default: 0, scope: "save" },
      seen_end: { type: "int", default: 0, scope: "global" },
    },
  };
  return { manifest, script: `${out.join("\n")}\n` };
}

/** Moves, adds, and removes a few lines, like a writer's next version (keeping other line IDs). */
function edit(script, seed) {
  const r = rng(seed ^ 0x5eed);
  const lines = script.split("\n");
  const sayRows = lines.map((l, i) => (/^\s+(\w+ )?"[^"]*"\s+#line:/.test(l) && !/:\s+#line:/.test(l) ? i : -1)).filter((i) => i >= 0);
  if (sayRows.length > 2) lines.splice(r.pick(sayRows), 1);
  const at = r.pick(sayRows.filter((i) => i < lines.length)) ?? 1;
  const indent = /^\s*/.exec(lines[at] ?? "    ")[0];
  lines.splice(at, 0, `${indent}"A line added in the next version."`);
  return lines.join("\n");
}

const characters = [
  { file: "characters/hana.md", text: "---\nid: hana\nname: Hana\n---\n" },
  { file: "characters/kai.md", text: "---\nid: kai\nname: Kai\n---\n" },
];
const inputOf = (manifest, script) => ({ manifest: { file: "himawari.json", text: JSON.stringify(manifest, null, 2) }, characters, scripts: [{ file: "script/story.hws", text: script }] });
const errorsOf = (check) => check.files.flatMap((f) => f.diagnostics.filter((d) => d.severity === "error").map((d) => `${f.file}: ${d.code} ${d.message}`));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const findings = [];
const finding = (seed, what, detail) => {
  findings.push({ seed, what, detail });
  console.log(`  story ${seed}: ${what}${detail ? `\n${String(detail).slice(0, 1500)}` : ""}`);
};
const memoryError = (s) => /AddressSanitizer|runtime error:|LeakSanitizer/.test(s);
let invalid = 0;
const games = [];

console.log(`Generating ${COUNT} stories (seed ${SEED}), runtime ${RUNTIME}`);
for (let i = 0; i < COUNT; i++) {
  const seed = SEED * 100000 + i;
  const { manifest, script: raw } = generate(seed);
  const script = format(raw).text;
  const check = checkProject(inputOf(manifest, script));
  const errors = errorsOf(check);
  if (errors.length) {
    invalid++;
    if (invalid <= 3) finding(seed, "the generator wrote a story Core rejects (a generator bug, or a Core false alarm)", `${errors.slice(0, 3).join("\n")}\n---\n${script}`);
    continue;
  }
  const compiled = compile(check);
  if (!compiled.module) {
    finding(seed, "checked clean but didn't compile", compiled.errors.map((e) => e.message).join("\n"));
    continue;
  }
  const hwb = join(OUT, `story${seed}.hwb`);
  writeFileSync(hwb, writeHwb(compiled.module));
  const edited = format(edit(script, seed)).text;
  const echeck = checkProject(inputOf(manifest, edited));
  const editedOk = errorsOf(echeck).length === 0 && !!compile(echeck).module;
  if (editedOk) writeFileSync(join(OUT, `story${seed}.edited.hwb`), writeHwb(compile(echeck).module));
  games.push({ seed, hwb, manifest, script, edited, editedOk });

  // E-12: every path, in the real runtime.
  const report = join(OUT, `story${seed}.playtest.json`);
  const p = spawnSync(RUNTIME, ["--headless", hwb, "--playtest", "max_steps=20000", "--out", report], { env, encoding: "utf8", timeout: 120000 });
  const all = `${p.stdout ?? ""}${p.stderr ?? ""}`;
  if (p.error || p.signal) finding(seed, `the playtest hung or was killed (${p.error?.message ?? p.signal})`);
  else if (memoryError(all)) finding(seed, "the playtest hit a memory error", all);
  else if (/ERROR \(/.test(all)) finding(seed, "the VM reported an error on some path", all.split("\n").filter((l) => l.includes("ERROR")).join("\n"));
}
console.log(`${games.length} stories built (${invalid} rejected by Core).`);

// E-13 to E-15: saves and rollback at every line, and saves into the edited story.
for (let k = 0; k < games.length; k += 40) {
  const batch = games.slice(k, k + 40);
  const s = spawnSync(SAVEANY, batch.map((g) => g.hwb), { env, encoding: "utf8", timeout: 600000 });
  const all = `${s.stdout ?? ""}${s.stderr ?? ""}`;
  if (s.status !== 0) {
    for (const line of all.split("\n").filter((l) => /E-1[345]|CHECK failed|Sanitizer|runtime error/.test(l))) {
      const seed = /story(\d+)/.exec(line)?.[1] ?? "?";
      finding(seed, line.replace(/^.*story\d+\.hwb: /, ""));
    }
    if (memoryError(all)) finding("batch", "test_saveany hit a memory error", all);
  }
}

// E-16: a release, an edit, a patch: data.hwp + patch plays like a fresh full build of the edit.
if (existsSync(RELEASE_RUNTIME)) {
  for (const g of games.filter((x) => x.editedOk).slice(0, 20)) {
    const dir = join(OUT, `pack${g.seed}`);
    const write = (script) => {
      mkdirSync(join(dir, "script"), { recursive: true });
      mkdirSync(join(dir, "characters"), { recursive: true });
      writeFileSync(join(dir, "himawari.json"), JSON.stringify(g.manifest, null, 2));
      for (const c of characters) writeFileSync(join(dir, c.file), c.text);
      writeFileSync(join(dir, "script", "story.hws"), script);
    };
    const release = (patch) => {
      const fs = new ProjectFs(dir);
      const c = compileProject(fs, { debug: false });
      return packageGame(fs, c.bytes, c.title, c.gameId, RELEASE_RUNTIME, { patch, version: c.version });
    };
    write(g.script);
    const first = release(false);
    write(g.edited);
    const patched = release(true);
    const fresh = join(OUT, `fresh${g.seed}`);
    cpSync(dir, fresh, { recursive: true, filter: (s) => !/[\\/]build$/.test(s) });
    const fs2 = new ProjectFs(fresh);
    const c2 = compileProject(fs2, { debug: false });
    const full = packageGame(fs2, c2.bytes, c2.title, c2.gameId, RELEASE_RUNTIME, { version: c2.version });
    const choices = "0 1 0 1 1 0 2 0 1 0 0 1";
    const play = (pack) => spawnSync(RUNTIME, ["--headless", pack, "--transcript", choices], { env, encoding: "utf8", timeout: 60000 }).stdout ?? "";
    const a = play(join(dir, first.dir.replace(/\//g, "\\"), "data.hwp"));
    const b = play(join(fresh, full.dir.replace(/\//g, "\\"), "data.hwp"));
    if (!patched.pack) finding(g.seed, "E-16: the edit produced no patch");
    else if (a !== b) finding(g.seed, "E-16: data.hwp + patch plays differently from a fresh build", `${a.slice(0, 600)}\n---\n${b.slice(0, 600)}`);
  }
}

const summary = `${games.length} stories played; ${findings.length} finding(s).`;
writeFileSync(join(OUT, "findings.json"), JSON.stringify(findings, null, 2));
console.log(`\n${summary}\nDetails: ${join(OUT, "findings.json")}`);
process.exit(findings.length ? 1 : 0);
