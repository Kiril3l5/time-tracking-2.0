/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["packages/*/src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/firestore-rules.test.ts"],
    passWithNoTests: true,
    setupFiles: ["./packages/common/src/setupTests.ts"],
  },
}); 