import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist", "coverage"] },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module"
      }
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "no-unused-vars": ["error", { "varsIgnorePattern": "^[A-Z_]", "argsIgnorePattern": "^(?:_|[A-Z])" }],
      "react-refresh/only-export-components": ["warn", { "allowConstantExport": true }]
    }
  },
  {
    files: ["src/app/FinanceContext.jsx", "src/features/auth/AuthContext.jsx"],
    rules: { "react-refresh/only-export-components": "off" }
  },
  {
    files: ["vite.config.js", "test/**/*.js"],
    languageOptions: { globals: globals.node }
  }
];
