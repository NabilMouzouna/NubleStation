import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load .env.local (Mac) by default; .env.docker is set via NUBLE_ENV_FILE in compose.
const envFile = process.env.NUBLE_ENV_FILE ?? ".env.local";
const envPath = resolve(process.cwd(), envFile);
if (existsSync(envPath)) {
  loadDotenv({ path: envPath });
}

// drizzle-kit `generate` doesn't connect, but `defineConfig` requires a url string.
// Fall back to a sentinel so schema generation works without a live DB.
const url =
  process.env.DATABASE_URL ?? "postgres://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "./src/db/schema/platform.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  schemaFilter: ["platform"],
  strict: true,
  verbose: true,
});
