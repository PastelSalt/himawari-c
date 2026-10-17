/** `hwc l10n sync | export | import` (plan §7, §9.2). */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type L10nTable,
  applyTranslations,
  checkProject,
  collectLines,
  parseTable,
  stringifyTable,
  syncTable,
  toCsv,
  toXliff,
  translationsFromCsv,
  translationsFromXliff,
} from "@himawari/core";
import { loadProject } from "./project.js";

export class L10nUsageError extends Error {}

function option(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function context(root: string) {
  const check = checkProject(loadProject(root));
  if (!check.manifest) throw new L10nUsageError("himawari.json is missing or unreadable");
  const scriptErrors = check.files.filter((f) => f.file.endsWith(".hws") && f.diagnostics.some((d) => d.severity === "error"));
  if (scriptErrors.length > 0) throw new L10nUsageError(`fix the errors in ${scriptErrors.map((f) => f.file).join(", ")} first (run hwc check)`);
  return { manifest: check.manifest, lines: collectLines(check.parsed) };
}

const tablePath = (root: string, lang: string) => join(root, "locales", `${lang}.json`);

function readTable(root: string, lang: string): L10nTable | null {
  const p = tablePath(root, lang);
  return existsSync(p) ? parseTable(readFileSync(p, "utf8")) : null;
}

function writeTable(root: string, table: L10nTable): void {
  mkdirSync(join(root, "locales"), { recursive: true });
  writeFileSync(tablePath(root, table.language), stringifyTable(table), "utf8");
}

export function l10n(root: string, args: readonly string[]): number {
  const [sub, ...rest] = args;
  if (sub === "sync") return sync(root);
  if (sub === "export") return exportTable(root, rest);
  if (sub === "import") return importFile(root, rest);
  throw new L10nUsageError("usage: hwc l10n sync | export --lang <lang> [--format csv|xliff] | import <file> --lang <lang> [--ai]");
}

function sync(root: string): number {
  const { manifest, lines } = context(root);
  const targets = manifest.languages.filter((l) => l !== manifest.sourceLanguage);
  if (targets.length === 0) {
    console.log(`Only the source language (${manifest.sourceLanguage}) is listed in himawari.json; add target languages to "languages" first.`);
    return 0;
  }
  for (const lang of targets) {
    const r = syncTable(readTable(root, lang), lines, lang, manifest.sourceLanguage);
    writeTable(root, r.table);
    const missing = r.table.lines.filter((e) => e.status === "missing").length;
    const review = r.table.lines.filter((e) => e.status === "needs-review").length;
    console.log(
      `locales/${lang}.json: ${r.table.lines.length} lines (+${r.added} new, ${r.changed} changed, -${r.removed} removed); ${missing} missing, ${review} need review`,
    );
  }
  return 0;
}

function exportTable(root: string, args: readonly string[]): number {
  const lang = option(args, "--lang");
  if (!lang) throw new L10nUsageError("usage: hwc l10n export --lang <lang> [--format csv|xliff]");
  const format = option(args, "--format") ?? "csv";
  if (format !== "csv" && format !== "xliff") throw new L10nUsageError('--format must be "csv" or "xliff"');
  const { manifest, lines } = context(root);
  // Always export from an up-to-date table.
  const table = syncTable(readTable(root, lang), lines, lang, manifest.sourceLanguage).table;
  writeTable(root, table);
  const out = join(root, "locales", `${lang}.${format === "csv" ? "csv" : "xlf"}`);
  writeFileSync(out, format === "csv" ? toCsv(table, lines) : toXliff(table, lines), "utf8");
  console.log(`✓ locales/${lang}.${format === "csv" ? "csv" : "xlf"}: ${table.lines.length} lines for translators`);
  return 0;
}

function importFile(root: string, args: readonly string[]): number {
  const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--lang");
  const lang = option(args, "--lang");
  if (!file || !lang) throw new L10nUsageError("usage: hwc l10n import <file> --lang <lang> [--ai]");
  if (!existsSync(file)) throw new L10nUsageError(`no such file: ${file}`);
  const text = readFileSync(file, "utf8");
  let translations: Map<string, string>;
  try {
    translations = /\.(xlf|xliff)$/i.test(file) ? translationsFromXliff(text) : translationsFromCsv(text);
  } catch (e) {
    throw new L10nUsageError(`${file}: ${(e as Error).message}`);
  }
  const { manifest, lines } = context(root);
  const table = syncTable(readTable(root, lang), lines, lang, manifest.sourceLanguage).table;
  const r = applyTranslations(table, translations, args.includes("--ai") ? "ai" : "human");
  writeTable(root, r.table);
  for (const x of r.refused) console.log(`✗ line ${x.id}: not imported, the translation ${x.problems.join("; ")}`);
  if (r.unknown.length > 0) console.log(`note: ${r.unknown.length} line ID(s) in the file aren't in the scripts (skipped): ${r.unknown.slice(0, 5).join(", ")}`);
  console.log(`locales/${lang}.json: ${r.updated} translation(s) imported, ${r.refused.length} refused`);
  return r.refused.length > 0 ? 1 : 0;
}
