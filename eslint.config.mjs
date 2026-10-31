import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsdoc from "eslint-plugin-jsdoc";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // A leading underscore marks a parameter that is deliberately unused (typed mocks in tests).
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  // Every exported function, component, class, type and constant is documented with JSDoc.
  // Pallav's rule for every PR, alongside 100% coverage and a code review (see AGENTS.md).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}", "src/test/**"],
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: { FunctionDeclaration: true, ArrowFunctionExpression: true, ClassDeclaration: true, FunctionExpression: true },
          contexts: ["TSInterfaceDeclaration", "TSTypeAliasDeclaration", "ExportNamedDeclaration > VariableDeclaration"],
        },
      ],
      "jsdoc/no-blank-blocks": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
