import tseslint from "typescript-eslint";
import noHardcodedUiStrings from "./eslint/no-hardcoded-ui-strings.js";

export const himawariPlugin = {
  rules: { "no-hardcoded-ui-strings": noHardcodedUiStrings },
};

export default tseslint.config(
  { ignores: ["**/dist/", "**/node_modules/", "runtime/", "**/out/", "**/release/", "**/build-resources/", ".claude/"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // `_name` marks a parameter that is deliberately unused (an interface's shape).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["packages/studio/**/*.{ts,tsx}"],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { himawari: himawariPlugin },
    rules: { "himawari/no-hardcoded-ui-strings": "error" },
  },
);
