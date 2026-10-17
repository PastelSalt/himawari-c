import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, test } from "vitest";
import rule from "../../eslint/no-hardcoded-ui-strings.js";

const linter = new Linter({ configType: "flat" });
const config: Linter.Config[] = [
  {
    files: ["**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser as Linter.Parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { himawari: { rules: { "no-hardcoded-ui-strings": rule } } },
    rules: { "himawari/no-hardcoded-ui-strings": "error" },
  },
];

const errorsIn = (code: string) =>
  linter.verify(code, config, { filename: "Welcome.tsx" }).map((m) => m.message);

describe("himawari/no-hardcoded-ui-strings", () => {
  test.each([
    ["JSX text", `const A = () => <button>New Project</button>;`],
    ["Japanese JSX text", `const A = () => <span>新規プロジェクト</span>;`],
    ["string in expression", `const A = () => <p>{"Open"}</p>;`],
    ["template literal", "const A = () => <p>{`Samples`}</p>;"],
    ["title attribute", `const A = () => <img title="Logo" />;`],
    ["aria-label in braces", `const A = () => <i aria-label={"Close"} />;`],
  ])("flags %s", (_name, code) => {
    expect(errorsIn(code)).toHaveLength(1);
  });

  test.each([
    ["FormattedMessage", `const A = () => <button><FormattedMessage id="welcome.newProject" /></button>;`],
    ["formatMessage attribute", `const A = () => <img alt={intl.formatMessage({ id: "app.title" })} />;`],
    ["punctuation only", `const A = () => <span> · → </span>;`],
    ["non-text attributes", `const A = () => <div className="row" data-testid="welcome" />;`],
    ["whitespace", `const A = () => (\n  <div>\n    <b />\n  </div>\n);`],
  ])("allows %s", (_name, code) => {
    expect(errorsIn(code)).toEqual([]);
  });
});
