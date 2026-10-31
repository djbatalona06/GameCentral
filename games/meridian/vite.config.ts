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
  },
});
