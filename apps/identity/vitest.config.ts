import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    setupFiles: ["./test/setup.ts"],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    env: {
      NUBLE_ENV_FILE: ".env.local",
    },
    include: ["test/**/*.test.ts"],
  },
});
