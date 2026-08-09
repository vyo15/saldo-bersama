import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const loadWorkspacePackage = (name) => {
  try {
    return require(name);
  } catch {
    return require(`./frontend/node_modules/${name}`);
  }
};

const globals = loadWorkspacePackage("globals");

export default [
  {
    ignores: [
      "node_modules/**",
      "frontend/**",
      ".git/**",
      ".vercel/**",
      "dist/**",
      "coverage/**"
    ]
  },
  {
    files: ["api/**/*.js", "scripts/**/*.{js,mjs}", "test/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^(?:_|[A-Z])",
          varsIgnorePattern: "^[A-Z_]"
        }
      ]
    }
  },
  {
    files: ["api/**/*.js"],
    rules: {
      complexity: ["warn", 20],
      "max-lines-per-function": [
        "warn",
        { max: 100, skipBlankLines: true, skipComments: true }
      ]
    }
  }
];
