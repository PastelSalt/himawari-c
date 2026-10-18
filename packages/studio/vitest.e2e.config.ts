import { defineConfig } from "vitest/config";

// Studio end-to-end tests: one Electron app, tests in order (they share it).
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.ts"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 90000,
    hookTimeout: 90000,
  },
});
