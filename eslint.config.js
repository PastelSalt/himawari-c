import tseslint from "typescript-eslint";
import noHardcodedUiStrings from "./eslint/no-hardcoded-ui-strings.js";

export const himawariPlugin = {
  rules: { "no-hardcoded-ui-strings": noHardcodedUiStrings },
};

export default tseslint.config(
  { ignores: ["**/dist/", "**/node_modules/", "runtime/", "out/"] },
  ...tseslint.configs.recommended,
  {
    files: ["packages/studio/**/*.{ts,tsx}"],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { himawari: himawariPlugin },
    rules: { "himawari/no-hardcoded-ui-strings": "error" },
  },
);
