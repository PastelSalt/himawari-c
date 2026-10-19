/**
 * The eval tasks: each starts from a copy of an example project, sometimes
 * with a planted problem, gives the agent one instruction (most are the
 * recipes Studio and MCP ship), and scores the project afterwards. Scores are
 * deterministic: they read the files, the checker, and a headless playtest,
 * never another model.
 */
import { NOTES_FILE, collectLines, parseTable, readNotes, stringifyTable } from "@himawari/core";
import { type ProjectFs, RECIPES, check } from "@himawari/tools";

export interface TaskScores {
  /** How well the task itself was done, 0–1. */
  task: number;
  /** Bible rules kept in new or changed lines, 0–1 (null when the task writes no dialogue). */
  bible: number | null;
  /** What the score saw, for the report. */
  notes: string[];
}

export interface EvalTask {
  id: string;
  title: string;
  /** examples/<project> */
  project: string;
  /** Plants the problem the agent should find. Returns anything the scorer needs. */
  setup(fs: ProjectFs): Record<string, string>;
  prompt: string;
  score(fs: ProjectFs, setup: Record<string, string>): TaskScores;
}

const recipe = (name: string, args: Record<string, string>) => {
  const r = RECIPES.find((x) => x.name === name);
  if (!r) throw new Error(`no recipe ${name}`);
  return r.prompt(args);
};

/** Lines a character says in the scripts now, by line ID. */
function spoken(fs: ProjectFs, speaker: string): Map<string, string> {
  const { check: c } = check(fs);
  return new Map(
    collectLines(c.parsed)
      .filter((l) => l.speaker === speaker)
      .map((l) => [l.id, l.text]),
  );
}

/** A bible rule as a pattern a line must not match (from the characters' "Must never" sections). */
interface BibleRule {
  speaker: string;
  rule: string;
  never: RegExp;
}

const FESTIVAL_RULES: BibleRule[] = [
  { speaker: "hana", rule: "never says the stall doesn't matter to her", never: /stall (doesn't|does not|didn't) matter|(don't|do not) care about the stall/i },
  { speaker: "hana", rule: "never calls the player by name", never: /\[player_name\]/ },
  { speaker: "ren", rule: "never admits he's scared in so many words", never: /\bI('m| am) (scared|afraid|terrified)\b/i },
  { speaker: "ren", rule: "never mocks Hana's stall", never: /(stupid|silly|lame|dumb) (stall|goldfish)/i },
];

/** Bible score over the lines that are new or changed since setup. */
function bibleScore(fs: ProjectFs, before: ReadonlySet<string>, notes: string[]): number | null {
  let checked = 0;
  let kept = 0;
  for (const speaker of new Set(FESTIVAL_RULES.map((r) => r.speaker))) {
    for (const [id, text] of spoken(fs, speaker)) {
      if (before.has(`${id}:${text}`)) continue;
      for (const r of FESTIVAL_RULES.filter((x) => x.speaker === speaker)) {
        checked++;
        if (r.never.test(text)) notes.push(`#${id} breaks "${speaker} ${r.rule}": ${text}`);
        else kept++;
      }
    }
  }
  return checked === 0 ? null : kept / checked;
}

const linesNow = (fs: ProjectFs) =>
  new Set(
    collectLines(check(fs).check.parsed).map((l) => `${l.id}:${l.text}`),
  );

export const TASKS: readonly EvalTask[] = [
  {
    id: "write-scene",
    title: "Write a scene in the characters' voices",
    project: "festival-eve",
    setup: (fs) => ({ before: [...linesNow(fs)].join("\n") }),
    prompt: `${recipe("write_scene", {
      scene: "night_walk",
      premise: "After the goldfish stall closes, Hana and the player walk home under the lanterns and talk about tomorrow. goldfish_ending should jump to night_walk instead of ending, and night_walk ends the story.",
    })}`,
    score(fs, s) {
      const notes: string[] = [];
      const { check: c } = check(fs);
      const before = new Set((s["before"] ?? "").split("\n"));
      const lines = collectLines(c.parsed).filter((l) => l.scene === "night_walk");
      const hana = lines.filter((l) => l.speaker === "hana").length;
      const scene = c.parsed.size > 0 && [...c.parsed.values()].some((r) => r.ast.scenes.some((x) => x.id === "night_walk"));
      const linked = [...c.parsed.values()].some((r) =>
        r.ast.scenes.some((x) => x.id === "goldfish_ending" && JSON.stringify(x.body).includes('"night_walk"')),
      );
      if (!scene) notes.push("there is no scene night_walk");
      if (!linked) notes.push("goldfish_ending doesn't lead to night_walk");
      if (hana < 2) notes.push(`Hana has ${hana} line(s) in night_walk`);
      const task = (scene ? 0.4 : 0) + (linked ? 0.3 : 0) + (hana >= 2 ? 0.3 : 0);
      return { task, bible: bibleScore(fs, before, notes), notes };
    },
  },
  {
    id: "continuity",
    title: "Find a planted contradiction and leave a note",
    project: "festival-eve",
    setup(fs) {
      const file = "script/routes.hws";
      const text = fs.read(file);
      const anchor = '    hana "Okay! Tank, nets, prizes… and the sign."   #line:6nr9jf\n';
      if (!text.includes(anchor)) throw new Error("festival-eve changed: update the continuity task");
      fs.write(file, text.replace(anchor, `${anchor}    hana "Honestly? The stall doesn't matter to me at all."   #line:evq001\n`));
      return { line: "evq001" };
    },
    prompt: recipe("continuity_check", { scene: "hana_route" }),
    score(fs, s) {
      const notes: string[] = [];
      const all = fs.exists(NOTES_FILE) ? readNotes(fs.read(NOTES_FILE)) : [];
      const hit = all.some((n) => n.line === s["line"] && (n.kind === "continuity" || n.kind === "character"));
      if (!hit) notes.push(`no continuity note on #${s["line"] ?? ""}`);
      const others = all.filter((n) => n.line !== s["line"]).length;
      if (others > 3) notes.push(`${others} other notes (noisy)`);
      notes.push(`${all.length} note(s) in all`);
      return { task: hit ? (others > 3 ? 0.5 : 1) : 0, bible: null, notes };
    },
  },
  {
    id: "translate",
    title: "Translate a scene following the glossary",
    project: "festival-eve",
    setup(fs) {
      fs.write("glossary.json", `${JSON.stringify({ terms: [{ source: "shinobue", translations: { ja: "篠笛" }, note: "a bamboo flute" }] }, null, 2)}\n`);
      const { check: c } = check(fs);
      const ids = new Set(collectLines(c.parsed).filter((l) => l.scene === "flute_ending").map((l) => l.id));
      const table = parseTable(fs.read("locales/ja.json"));
      const cleared = { ...table, lines: table.lines.map((e) => (ids.has(e.id) ? { ...e, text: "", status: "missing" as const } : e)) };
      fs.write("locales/ja.json", stringifyTable(cleared));
      return { ids: [...ids].join(" "), original: JSON.stringify(Object.fromEntries(table.lines.filter((e) => ids.has(e.id)).map((e) => [e.id, e.text]))) };
    },
    prompt: recipe("translate_scene", { scene: "flute_ending", lang: "ja" }),
    score(fs, s) {
      const notes: string[] = [];
      const ids = (s["ids"] ?? "").split(" ").filter(Boolean);
      const table = parseTable(fs.read("locales/ja.json"));
      const done = table.lines.filter((e) => ids.includes(e.id) && e.text !== "");
      const { check: c } = check(fs);
      const misses = c.files.flatMap((f) => f.diagnostics).filter((d) => d.code === "HW0407").length;
      const broken = c.files.flatMap((f) => f.diagnostics).filter((d) => d.code === "HW0401").length;
      if (done.length < ids.length) notes.push(`${ids.length - done.length} of ${ids.length} lines left untranslated`);
      if (misses) notes.push(`${misses} glossary miss(es)`);
      if (broken) notes.push(`${broken} translation(s) with broken markup`);
      const task = ids.length === 0 ? 0 : (done.length / ids.length) * (misses ? 0.5 : 1) * (broken ? 0.5 : 1);
      return { task, bible: null, notes };
    },
  },
  {
    id: "fix-unreachable",
    title: "Find why an ending can't be reached and fix it",
    project: "festival-eve",
    setup(fs) {
      const file = "script/start.hws";
      const text = fs.read(file);
      const from = '        "With Ren, on the shrine steps.":   #line:ksn4f9\n';
      if (!text.includes(from)) throw new Error("festival-eve changed: update the fix-unreachable task");
      fs.write(file, text.replace(from, '        "With Ren, on the shrine steps." if lantern_stall:   #line:ksn4f9\n'));
      return {};
    },
    prompt: `${recipe("playtest_report", {})}\n\nThen apply your fix (the writer has agreed to it already).`,
    score(fs) {
      // The playtest itself is the shared playtest score; here: the option is reachable again and the planted condition is gone.
      const text = fs.read("script/start.hws");
      const fixed = !/"With Ren, on the shrine steps\." if lantern_stall:/.test(text) && text.includes("#line:ksn4f9");
      return { task: fixed ? 1 : 0, bible: null, notes: fixed ? [] : ["the Ren option is still hidden behind lantern_stall"] };
    },
  },
  {
    id: "proofread",
    title: "Fix planted typos without touching the voice",
    project: "festival-eve",
    setup(fs) {
      const file = "script/routes.hws";
      let text = fs.read(file);
      for (const [a, b] of [
        ["then to the steps, then back", "then to teh steps, then back"],
        ["half of the problem, she's right.", "half of the problem, she's rigth."],
      ] as const) {
        if (!text.includes(a)) throw new Error("festival-eve changed: update the proofread task");
        text = text.replace(a, b);
      }
      fs.write(file, text);
      return {};
    },
    prompt: recipe("proofread", { scene: "both_route" }),
    score(fs) {
      const notes: string[] = [];
      const text = fs.read("script/routes.hws");
      const fixes = [
        ['"I run to the stall, then to the steps, then back to the stall."   #line:janw5p', "#janw5p"],
        ['ren "Speaking as half of the problem, she\'s right."   #line:khf2gn', "#khf2gn"],
      ] as const;
      let fixed = 0;
      for (const [line, id] of fixes) {
        if (text.includes(line)) fixed++;
        else notes.push(`${id} not fixed`);
      }
      // Hana's trailing "…" is her voice, not a typo.
      const kept = text.includes('hana "You don\'t have to split yourself in half…"   #line:yxv4b1');
      if (!kept) notes.push("#yxv4b1 was changed (its trailing … is Hana's voice)");
      return { task: (fixed / fixes.length) * (kept ? 1 : 0.5), bible: null, notes };
    },
  },
];
