import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const envFile = process.env.NUBLE_ENV_FILE ?? ".env.local";
const envPath = resolve(process.cwd(), envFile);
if (existsSync(envPath)) {
  loadDotenv({ path: envPath });
}

const schema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_TEST: z.string().url().optional(),
  INTERNAL_HMAC_SECRET: z.string().min(16),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment for apps/blaze:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function getDatabaseUrl(): string {
  const cfg = loadConfig();
  if (cfg.NODE_ENV === "test" && cfg.DATABASE_URL_TEST) {
    return cfg.DATABASE_URL_TEST;
  }
  return cfg.DATABASE_URL;
}
