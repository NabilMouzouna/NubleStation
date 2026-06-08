import { defineConfig } from "vitest/config";

// Separate config for migration-unit tests: no database needed, no DB setup file.
// drizzle-kit/api is a CJS bundle — tell Vite to skip transforming it.
export default defineConfig({
  test: {
    pool: "forks",
    testTimeout: 15_000,
    include: ["test/migrations/**/*.test.ts"],
    server: {
      deps: {
        external: [/drizzle-kit/],
      },
    },
  },
});
