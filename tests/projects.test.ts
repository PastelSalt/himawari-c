/**
 * Phase 1 exit criterion (plan §18): the tutorial and starter projects
 * compile. Every template, rendered by `hwc init`, and every example must
 * have no errors or warnings (placeholder notes are fine, P5), compile, and
 * survive the validating .hwb reader.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { TEMPLATES, projectId, readTemplate, renderTemplate } from "../packages/cli/src/init.js";
import { compile } from "../packages/core/src/bytecode/compiler.js";
import { readHwb } from "../packages/core/src/bytecode/reader.js";
import { writeHwb } from "../packages/core/src/bytecode/writer.js";
import { type ProjectInput, type SourceFile, checkProject } from "../packages/core/src/project/check.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function toInput(files: readonly SourceFile[]): ProjectInput {
  const input: ProjectInput = {
    characters: files.filter((f) => f.file.startsWith("characters/") && f.file.endsWith(".md")),
    scripts: files.filter((f) => f.file.endsWith(".hws")),
    assets: files.filter((f) => f.file.startsWith("assets/") && !f.file.endsWith("README.md")).map((f) => f.file.slice(7)),
  };
  const manifest = files.find((f) => f.file === "himawari.json");
  if (manifest) input.manifest = manifest;
  return input;
}

function readProject(dir: string): SourceFile[] {
  const out: SourceFile[] = [];
  const visit = (p: string, rel: string) => {
    for (const n of readdirSync(p).sort()) {
      const full = join(p, n);
      if (statSync(full).isDirectory()) visit(full, `${rel}${n}/`);
      else out.push({ file: `${rel}${n}`, text: readFileSync(full, "utf8") });
    }
  };
  visit(dir, "");
  return out;
}

function expectHealthy(files: readonly SourceFile[]) {
  const check = checkProject(toInput(files));
  const problems = check.files.flatMap((f) => f.diagnostics.filter((d) => d.severity !== "info").map((d) => `${f.file}: ${d.code} ${d.message}`));
  expect(problems).toEqual([]);
  const r = compile(check);
  expect(r.errors).toEqual([]);
  const module = r.module!;
  expect(readHwb(writeHwb(module))).toEqual(module);
  return module;
}

describe("templates (hwc init)", () => {
  for (const t of TEMPLATES) {
    test(`${t}: renders, checks clean, compiles`, () => {
      let n = 0;
      const files = renderTemplate(readTemplate(t, join(ROOT, "templates")), { name: "My Novel", lang: "en", random: () => ++n });
      expect(files.map((f) => f.file)).toContain(".gitignore");
      expect(files.map((f) => f.file)).toContain("AGENTS.md");
      expect(files.every((f) => !f.text.includes("{{"))).toBe(true);
      const m = expectHealthy(files);
      expect(m.strings[m.scenes[m.entryScene]?.name ?? 0]).toBe("start");
    });
  }

  test("every dialogue line gets a unique line ID", () => {
    const files = renderTemplate(readTemplate("adv", join(ROOT, "templates")), { name: "X", lang: "en" });
    const script = files.find((f) => f.file === "script/start.hws")?.text ?? "";
    const ids = [...script.matchAll(/#line:(\w{6})/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(5);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("names with quotes stay valid JSON; ids are derived safely", () => {
    const files = renderTemplate(readTemplate("blank", join(ROOT, "templates")), { name: 'Say "Hi"', lang: "ja" });
    const manifest = JSON.parse(files.find((f) => f.file === "himawari.json")?.text ?? "{}");
    expect(manifest.name).toBe('Say "Hi"');
    expect(manifest.sourceLanguage).toBe("ja");
    expect(projectId('Say "Hi"')).toBe("dev.example.say-hi");
    expect(projectId("123 Go")).toBe("dev.example.game-123-go");
    expect(projectId("ひまわり")).toBe("dev.example.my-novel");
  });
});

describe("examples", () => {
  const dir = join(ROOT, "examples");
  const examples = existsSync(dir) ? readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory()) : [];

  test("the tutorial exists", () => expect(examples).toContain("tutorial"));

  for (const name of examples) {
    test(`${name}: checks clean and compiles`, () => {
      const files = readProject(join(dir, name)).filter((f) => !f.file.startsWith("locales/") && !f.file.startsWith("build/"));
      const m = expectHealthy(files);
      expect(m.scenes.length).toBeGreaterThan(0);
    });
  }
});
