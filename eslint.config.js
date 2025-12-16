const js = require("@eslint/js");
const eslintConfigPrettier = require("eslint-config-prettier");

module.exports = [
  js.configs.recommended,
  eslintConfigPrettier,
  {
    files: ["public/**/*.js", "public-next/**/*.js"],
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
        URL: "readonly",
        localStorage: "readonly",
        clearTimeout: "readonly",
        setTimeout: "readonly",
        confirm: "readonly",
        alert: "readonly",
        navigator: "readonly",
        crypto: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["error", { 
        "argsIgnorePattern": "^(newState|iter|userPrompt|contextDocs)$",
        "varsIgnorePattern": "^(iterations|docsQuery|extracted)$" 
      }]
    }
  }
];
