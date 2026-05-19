import { config } from "@nublestation/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    ignores: ["dist/**", "drizzle/**", "node_modules/**"],
  },
];
