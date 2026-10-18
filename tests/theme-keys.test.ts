/**
 * The UI strings a theme can replace (`strings.<lang>.<key>`) must be exactly
 * the runtime's: Core validates themes against THEME_STRING_KEYS, and the
 * runtime looks themed strings up by the keys in hw_ui_text.c. Every string
 * also needs its Japanese version (plan §11.5: Japanese is required).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { THEME_STRING_KEYS } from "../packages/core/src/project/theme.js";

const source = readFileSync(fileURLToPath(new URL("../runtime/src/app/hw_ui_text.c", import.meta.url)), "utf8");

/** The designated initializers of one C array: enum name → value. */
function table(name: string): Map<string, string> {
  const start = source.indexOf(`static const char *const ${name}[UI_COUNT] = {`);
  expect(start, `${name} table`).toBeGreaterThanOrEqual(0);
  const body = source.slice(start, source.indexOf("\n};", start));
  return new Map([...body.matchAll(/\[(UI_[A-Z0-9_]+)\] = "((?:[^"\\]|\\.)*)"/g)].map((m) => [m[1] as string, m[2] as string]));
}

describe("theme string keys", () => {
  const keys = table("KEYS");
  const en = table("EN");
  const ja = table("JA");

  test("Core's THEME_STRING_KEYS are exactly the runtime's keys", () => {
    expect([...keys.values()].sort()).toEqual([...THEME_STRING_KEYS].sort());
  });

  test("every string has a key, English, and Japanese", () => {
    for (const id of keys.keys()) {
      expect(en.get(id), `${id} in EN`).toBeTruthy();
      expect(ja.get(id), `${id} in JA`).toBeTruthy();
    }
    expect([...en.keys()].sort()).toEqual([...keys.keys()].sort());
  });

  test("translations keep the printf placeholders", () => {
    const ph = (s: string) => (s.replace(/%%/g, "").match(/%./g) ?? []).join("");
    for (const [id, text] of en) expect(ph(ja.get(id) ?? ""), id).toBe(ph(text));
  });
});
