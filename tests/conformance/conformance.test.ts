/**
 * Conformance suite, compile half (plan §16.2). Each folder in cases/ is a
 * small project. It must either compile to exactly `expected.disasm`, or
 * report exactly `expected.diagnostics` (one `CODE file:line:col` per line).
 * Compile cases also commit `expected.hwb`, the exact bytes; the C runtime's
 * conformance test (runtime/tests/test_conformance.c) plays those bytes and
 * compares its transcript with `expected.transcript` (the execution half).
 *
 * Regenerate expected files (then review the diff!) with:
 *   UPDATE_CONFORMANCE=1 corepack pnpm vitest run tests/conformance
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { type ProjectInput, checkProject } from "../../packages/core/src/project/check.js";
import { compile } from "../../packages/core/src/bytecode/compiler.js";
import { disassemble } from "../../packages/core/src/bytecode/disasm.js";
import { readHwb } from "../../packages/core/src/bytecode/reader.js";
import { writeHwb } from "../../packages/core/src/bytecode/writer.js";
import { LineIndex } from "../../packages/core/src/syntax/position.js";

const STORY_HINTS: ReadonlySet<string> = new Set(["HW0340", "HW0341", "HW0342"]);

const CASES = fileURLToPath(new URL("./cases/", import.meta.url));
const UPDATE = process.env["UPDATE_CONFORMANCE"] === "1";

function files(dir: string, base: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n), `${base}${n}/`, ext) : n.endsWith(ext) ? [`${base}${n}`] : []))
    .sort();
}

function load(dir: string): ProjectInput {
  const read = (f: string) => ({ file: f, text: readFileSync(join(dir, f), "utf8") });
  const input: ProjectInput = {
    characters: files(join(dir, "characters"), "characters/", ".md").map(read),
    scripts: files(join(dir, "script"), "script/", ".hws").map(read),
    locales: files(join(dir, "locales"), "locales/", ".json").map(read),
    extensions: files(join(dir, "extensions"), "extensions/", ".schema.json").map(read),
  };
  if (existsSync(join(dir, "himawari.json"))) input.manifest = read("himawari.json");
  if (existsSync(join(dir, "theme", "theme.json"))) input.theme = read("theme/theme.json");
  return input;
}

const cases = readdirSync(CASES).filter((n) => statSync(join(CASES, n)).isDirectory()).sort();

describe("conformance (compile half)", () => {
  test("there are cases", () => expect(cases.length).toBeGreaterThan(0));

  for (const name of cases) {
    test(name, () => {
      const dir = join(CASES, name);
      const check = checkProject(load(dir));
      const diagFile = join(dir, "expected.diagnostics");
      const disasmFile = join(dir, "expected.disasm");

      // The cases test the language, not the stories: the story hints (HW0340–HW0342, unit-tested in Core) are left out.
      const diagnostics = check.files.flatMap((f) => {
        const idx = new LineIndex(f.source);
        return f.diagnostics.filter((d) => !STORY_HINTS.has(d.code)).map((d) => {
          const { line, col } = idx.at(d.span.start);
          return `${d.code} ${f.file}:${line}:${col}`;
        });
      });

      // A case with real errors is a diagnostics case; anything else must compile.
      const hasErrors = check.files.some((f) => f.diagnostics.some((d) => d.severity === "error"));
      if (existsSync(diagFile) || (UPDATE && hasErrors && !existsSync(disasmFile))) {
        const actual = `${diagnostics.join("\n")}\n`;
        if (UPDATE) writeFileSync(diagFile, actual);
        expect(actual).toBe(readFileSync(diagFile, "utf8"));
        return;
      }

      // Compile cases must be clean: no errors, warnings, or notes.
      expect(diagnostics).toEqual([]);
      const r = compile(check);
      expect(r.errors.map((e) => `${e.file}: ${e.message}`)).toEqual([]);
      const module = r.module!;
      // The bytes must survive the validating reader unchanged.
      expect(readHwb(writeHwb(module))).toEqual(module);
      const actual = disassemble(module);
      if (UPDATE) writeFileSync(disasmFile, actual);
      expect(actual).toBe(readFileSync(disasmFile, "utf8"));
      const hwbFile = join(dir, "expected.hwb");
      const bytes = writeHwb(module);
      if (UPDATE) writeFileSync(hwbFile, bytes);
      expect(Buffer.from(bytes).equals(readFileSync(hwbFile))).toBe(true);
    });
  }
});
