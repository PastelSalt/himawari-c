import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";

const specDir = fileURLToPath(new URL("../../spec/", import.meta.url));
const readJson = (name: string): unknown => JSON.parse(readFileSync(specDir + name, "utf8"));

function frontmatter(markdown: string): unknown {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown.replace(/\r\n/g, "\n"));
  if (!match?.[1]) throw new Error("no frontmatter");
  return parseYaml(match[1]);
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addSchema(readJson("manifest.schema.json") as object);
ajv.addSchema(readJson("character.schema.json") as object);

const validateManifest = ajv.getSchema("https://pastelsalt.github.io/himawari/spec/manifest/1.0.json")!;
const validateCharacter = ajv.getSchema("https://pastelsalt.github.io/himawari/spec/character/1.0.json")!;

describe("manifest schema", () => {
  const example = readJson("examples/himawari.json") as Record<string, unknown>;

  test("plan §5.5 example is valid", () => {
    expect(validateManifest(example), JSON.stringify(validateManifest.errors)).toBe(true);
  });

  test.each([
    ["bad id", { id: "Sunflower Days" }],
    ["bad semver", { version: "1.0" }],
    ["bad language tag", { languages: ["english"] }],
    ["float resolution", { resolution: [1920.5, 1080] }],
    ["unknown key", { extra: 1 }],
    ["int var with bool default", { variables: { x: { type: "int", default: true, scope: "save" } } }],
    ["var without scope", { variables: { x: { type: "bool", default: false } } }],
    ["enum on non-str var", { variables: { x: { type: "int", default: 0, scope: "save", enum: ["a"] } } }],
  ])("rejects %s", (_name, patch) => {
    expect(validateManifest({ ...example, ...patch })).toBe(false);
  });
});

describe("character schema", () => {
  const hana = frontmatter(readFileSync(specDir + "examples/hana.md", "utf8")) as Record<string, unknown>;

  test("plan §6.3 example frontmatter is valid", () => {
    expect(validateCharacter(hana), JSON.stringify(validateCharacter.errors)).toBe(true);
  });

  test("accepts a plain string name and no sprite", () => {
    expect(validateCharacter({ id: "me", name: "Me" })).toBe(true);
  });

  test.each([
    ["uppercase id", { id: "Hana" }],
    ["bad color", { color: "orange" }],
    ["bad name language", { name: { English: "Hana" } }],
    ["always group with default", { sprite: { root: "s", groups: { body: { always: true, default: "a" } } } }],
    ["rule with hide and show", { sprite: { root: "s", rules: [{ hide: "a", show: "b", when: "x" }] } }],
    ["rule with neither hide nor show", { sprite: { root: "s", rules: [{ when: "x" }] } }],
    ["multiple group under always", { sprite: { root: "s", groups: { body: { always: true, multiple: true } } } }],
    ["crop with 3 numbers", { sprite: { root: "s", views: { side: { crop: [1, 2, 3] } } } }],
  ])("rejects %s", (_name, patch) => {
    expect(validateCharacter({ ...hana, ...patch })).toBe(false);
  });
});
