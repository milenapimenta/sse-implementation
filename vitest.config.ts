import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["src/tests/**/*.test.ts", "src/tests/**/*.integration.test.ts"],
    testTimeout: 10000,
    hookTimeout: 20000,
    sequence: {
      concurrent: false
    }
  }
});
