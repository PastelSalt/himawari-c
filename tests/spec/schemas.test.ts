import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";
import { readExtension } from "../../packages/core/src/project/invoke.js";
import { readTheme } from "../../packages/core/src/project/theme.js";
import { parseAst } from "../../packages/core/src/syntax/ast.js";

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

ajv.addSchema(readJson("ast.schema.json") as object);
const validateAst = ajv.getSchema("https://pastelsalt.github.io/himawari-c/spec/ast/1.1.json")!;

const validateManifest = ajv.getSchema("https://pastelsalt.github.io/himawari-c/spec/manifest/1.0.json")!;
const validateCharacter = ajv.getSchema("https://pastelsalt.github.io/himawari-c/spec/character/1.0.json")!;
const validateExtension = ajv.compile(readJson("extension.schema.json") as object);
const validateTheme = ajv.compile(readJson("theme.schema.json") as object);
const caseFile = (f: string) => readFileSync(fileURLToPath(new URL(`../conformance/cases/extend/${f}`, import.meta.url)), "utf8");

describe("extension and theme schemas (rfcs/0007)", () => {
  test.each(["extensions/phone.schema.json", "extensions/screen_tint.schema.json"])("%s is valid, and Core agrees", (f) => {
    const text = caseFile(f);
    expect(validateExtension(JSON.parse(text)), JSON.stringify(validateExtension.errors)).toBe(true);
    expect(readExtension(f, text).diagnostics).toEqual([]);
  });

  test("the conformance theme is valid, and Core agrees", () => {
    const text = caseFile("theme/theme.json");
    expect(validateTheme(JSON.parse(text)), JSON.stringify(validateTheme.errors)).toBe(true);
    expect(readTheme(text).diagnostics).toEqual([]);
  });

  test("every setting the theme schema allows is one Core knows", () => {
    const schema = readJson("theme.schema.json") as { properties: Record<string, { properties?: Record<string, unknown> }> };
    for (const [group, def] of Object.entries(schema.properties)) {
      if (group === "$schema" || group === "strings") continue;
      for (const key of Object.keys(def.properties ?? {})) {
        const value = key === "slice" ? [1, 1, 1, 1] : group === "colors" ? "#000000" : ["image", "main", "name", "background", "music"].includes(key) ? "a/b" : 50;
        const r = readTheme(JSON.stringify({ [group]: { [key]: value } }));
        expect(r.diagnostics.filter((d) => d.code === "HW0131"), `${group}.${key}`).toEqual([]);
      }
    }
  });

  test.each([
    ["extension without params", validateExtension, { name: "x" }],
    ["extension with a bad type", validateExtension, { name: "x", params: [{ name: "a", type: "float" }] }],
    ["theme color", validateTheme, { colors: { accent: "orange" } }],
    ["theme unknown group", validateTheme, { colours: {} }],
  ])("rejects %s", (_name, validate, value) => {
    expect(validate(value)).toBe(false);
  });
});

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

describe("AST schema", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  /** Every .hws under a folder, recursively. */
  const scripts = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const full = join(dir, n);
      return statSync(full).isDirectory() ? scripts(full) : n.endsWith(".hws") ? [full] : [];
    });
  const files = [
    ...scripts(join(root, "tests/conformance/cases")),
    ...scripts(join(root, "examples")),
    ...scripts(join(root, "templates")),
  ];

  test("there are real scripts to validate", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  test.each(files.map((f) => [f.slice(root.length).replaceAll("\\", "/"), f]))("%s matches the schema", (_name, file) => {
    const { ast } = parseAst(readFileSync(file, "utf8"), file);
    const json = JSON.parse(JSON.stringify(ast)) as unknown;
    expect(validateAst(json), JSON.stringify(validateAst.errors?.slice(0, 3))).toBe(true);
  });

  test("covers every statement and expression kind", () => {
    const src = `define statement m(c: character, n: int = -2, w: word = x):
    show c

scene s:
    textbox nvl
    m(h, w=y)
    ext(h, "t {b}u{/b}")   #line:aaaaaa
    bg a with rule(m, 300)
    cg b
    show h x -y at left with fade(1)
    hide h
    move h at right
    music m fade(1)
    sfx s
    stop music fade(2)
    wait(5)
    shake
    flash(9)
    $ v = -1 + rand(6) * (2 % 3) - 4 / 1
    $ w = "e"
    if not v == 1 or v != 2 and v < 3 and v <= 3 and v > 0 and v >= 0 and true:
        call s
    elif false:
        return
    else:
        jump s
    menu:
        once "o {w=1}{nw}{alt=x} {b}b{/b} [v] {select w: e="1" other="2"}" if v > 1:
            "n"
        "p":
            end
    h "x"
    end
`;
    const { ast, diagnostics } = parseAst(src);
    expect(diagnostics).toEqual([]);
    expect(validateAst(JSON.parse(JSON.stringify(ast))), JSON.stringify(validateAst.errors?.slice(0, 3))).toBe(true);
  });

  test("rejects malformed ASTs", () => {
    expect(validateAst({ version: "1.1", file: "x", macros: [], scenes: [{ kind: "Scene", id: "s", span: { start: 0, end: 1 }, body: [{ kind: "Teleport" }] }] })).toBe(false);
    expect(validateAst({ version: "2.0", file: "x", scenes: [], macros: [] })).toBe(false);
  });
});
