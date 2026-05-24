import { Pool } from "pg";

const url = process.env.PLATFORM_DB_URL;
if (!url) throw new Error("PLATFORM_DB_URL is not set");

// Singleton pool — reused across server-action invocations in the same process.
let pool: Pool | null = null;

export function getPlatformPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: url, max: 5 });
  }
  return pool;
}
