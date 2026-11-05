import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2500,
  },
  server: { host: true },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // The story tests play whole simulated chapters; on a slow computer (or a busy CI machine) a few
    // of them take longer than vitest's 5 second default even though they pass.
    testTimeout: 30_000,
  },
});
