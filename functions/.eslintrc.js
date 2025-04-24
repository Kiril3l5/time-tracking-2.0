module.exports = {
  root: true,
  env: {
    // Default environment for TS files
    es2021: true, 
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google", 
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.dev.json"],
    sourceType: "module", // For TypeScript source files
    ecmaVersion: 2021,
  },
  ignorePatterns: [
    "lib/", // More robust ignore pattern for the build output directory
    "node_modules/",
    ".eslintrc.js", // Ignore self in main config, handle in overrides
    "generated/**/*",
  ],
  plugins: [
    "@typescript-eslint",
    "import",
  ],
  rules: {
    // --- General Rules --- 
    "quotes": ["error", "double"],
    "import/no-unresolved": 0,
    "indent": ["error", 2],
    "require-jsdoc": "off", // Often too verbose for functions
    "valid-jsdoc": "off", // Often too verbose for functions
    "object-curly-spacing": ["error", "always"],
    "max-len": ["warn", { "code": 120 }], // Warn on long lines
    // --- Keep Console Allowed --- 
    "no-console": "off", 
    // --- Re-enable previously disabled rules --- 
    // "no-undef": "off", // Re-enable - should be handled by env/overrides
    "@typescript-eslint/no-explicit-any": "warn", // Warn instead of disallowing 'any'
    "@typescript-eslint/no-var-requires": "warn", // Warn instead of disallowing require()
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }], // Warn on unused vars
  },
  overrides: [
    {
      // Specific configuration for the ESLint config file itself
      files: [".eslintrc.js"],
      env: {
        node: true, // Use Node environment for this file
        es6: false, // It's CommonJS, not ES6 module
      },
      parserOptions: {
        sourceType: "script", // Treat as CommonJS script
        project: null, // Don't use tsconfig for this file
      },
      rules: {
         "@typescript-eslint/no-var-requires": "off", // Allow require in this file if needed
      }
    },
    {
        // Ensure TS rules only apply to TS files
        files: ["*.ts"],
        env: { 
            node: true, // TS files in functions also run in Node
            es2021: true 
        },
        parserOptions: {
            project: ["tsconfig.json", "tsconfig.dev.json"],
            sourceType: "module",
        },
        rules: {
           // Add any specific TS rules here if needed 
           "no-undef": "off" // Turn off basic no-undef for TS files, TS checks this better
        }
    }
  ]
};
