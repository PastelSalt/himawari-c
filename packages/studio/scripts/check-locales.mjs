// CI `i18n` job (plan §11.5, §14.6): every locale has exactly the keys of en.json,
// every message is valid ICU MessageFormat, every translation uses the same
// arguments as the English message, and every message key written in Studio's
// source exists.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, TYPE } from "@formatjs/icu-messageformat-parser";

const SOURCE = "en";
const localesDir = fileURLToPath(new URL("../locales/", import.meta.url));

/** Collects argument names used anywhere in a parsed message. */
function argumentsOf(elements, out = new Set()) {
  for (const el of elements) {
    if (el.type === TYPE.literal || el.type === TYPE.pound) continue;
    if (el.type === TYPE.tag) {
      argumentsOf(el.children, out);
      continue;
    }
    out.add(el.value);
    if (el.type === TYPE.select || el.type === TYPE.plural) {
      for (const option of Object.values(el.options)) argumentsOf(option.value, out);
    }
  }
  return out;
}

function load(lang) {
  return JSON.parse(readFileSync(`${localesDir}${lang}.json`, "utf8"));
}

const errors = [];
const parsed = {};

const langs = readdirSync(localesDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -".json".length));

for (const lang of langs) {
  parsed[lang] = {};
  for (const [key, message] of Object.entries(load(lang))) {
    if (typeof message !== "string") {
      errors.push(`${lang}: "${key}" is not a string`);
      continue;
    }
    try {
      parsed[lang][key] = argumentsOf(parse(message));
    } catch (e) {
      errors.push(`${lang}: "${key}" is not valid ICU MessageFormat (${e.message})`);
    }
  }
}

if (!parsed[SOURCE]) {
  errors.push(`missing source locale ${SOURCE}.json`);
} else {
  const sourceKeys = Object.keys(parsed[SOURCE]);
  for (const lang of langs.filter((l) => l !== SOURCE)) {
    const keys = Object.keys(parsed[lang]);
    for (const key of sourceKeys.filter((k) => !keys.includes(k))) errors.push(`${lang}: missing "${key}"`);
    for (const key of keys.filter((k) => !sourceKeys.includes(k))) errors.push(`${lang}: extra key "${key}"`);
    for (const key of sourceKeys.filter((k) => keys.includes(k))) {
      const want = [...parsed[SOURCE][key]].sort().join(",");
      const got = [...parsed[lang][key]].sort().join(",");
      if (want !== got) errors.push(`${lang}: "${key}" uses arguments {${got}}, expected {${want}}`);
    }
  }
}

// Keys written literally in the renderer ("panel.problems") must exist in en.json.
if (parsed[SOURCE]) {
  const namespaces = new Set(Object.keys(parsed[SOURCE]).map((k) => k.split(".")[0]));
  const srcDir = fileURLToPath(new URL("../src/renderer/src/", import.meta.url));
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) visit(full);
      else if (/\.tsx?$/.test(name)) {
        const text = readFileSync(full, "utf8");
        const seen = new Set();
        // Any literal in a known namespace ("panel.problems"), and any literal passed as a message id, whatever its namespace.
        for (const m of text.matchAll(/["'`]([a-z][a-zA-Z]*(?:\.[a-zA-Z0-9-]+)+)["'`]/g)) {
          if (namespaces.has(m[1].split(".")[0])) seen.add(m[1]);
        }
        for (const m of text.matchAll(/\bid[:=]\s*\{?\s*["'`]([a-z][a-zA-Z]*(?:\.[a-zA-Z0-9-]+)+)["'`]/g)) seen.add(m[1]);
        for (const key of seen) if (!(key in parsed[SOURCE])) errors.push(`${name}: uses "${key}", which isn't in en.json`);
      }
    }
  };
  visit(srcDir);
}

if (errors.length > 0) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ ${langs.length} locales, ${Object.keys(parsed[SOURCE]).length} messages, all in sync`);
