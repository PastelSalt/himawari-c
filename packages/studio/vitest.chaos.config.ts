import { defineConfig } from "vitest/config";

// The Studio monkey (BREAK_IT.md S-1 to S-4): seeds one after another, each with its own Studio.
export default defineConfig({
  test: {
    include: ["e2e/**/*.chaos.ts"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 600000,
    hookTimeout: 90000,
  },
});
