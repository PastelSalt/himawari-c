import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";
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
const validateAst = ajv.getSchema("https://pastelsalt.github.io/himawari-c/spec/ast/1.0.json")!;

const validateManifest = ajv.getSchema("https://pastelsalt.github.io/himawari-c/spec/manifest/1.0.json")!;
const validateCharacter = ajv.getSchema("https://pastelsalt.github.io/himawari-c/spec/character/1.0.json")!;

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
    const src = `scene s:
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
    expect(validateAst({ version: "1.0", file: "x", scenes: [{ kind: "Scene", id: "s", span: { start: 0, end: 1 }, body: [{ kind: "Teleport" }] }] })).toBe(false);
    expect(validateAst({ version: "2.0", file: "x", scenes: [] })).toBe(false);
  });
});
