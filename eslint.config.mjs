import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Shared ESLint config for workspace packages (not the Next.js app). */
export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.js", "**/*.mjs", "**/*.cjs"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },
);
