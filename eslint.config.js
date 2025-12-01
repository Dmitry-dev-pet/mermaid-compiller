const js = require("@eslint/js");
const eslintConfigPrettier = require("eslint-config-prettier");

module.exports = [
  js.configs.recommended,
  eslintConfigPrettier,
  {
    files: ["public/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        mermaid: "readonly",
        fetch: "readonly",
        document: "readonly",
        window: "readonly",
        console: "readonly",
        Blob: "readonly",
        URL: "readonly"
      }
    },
    rules: {}
  }
];
