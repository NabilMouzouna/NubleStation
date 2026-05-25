import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const url = process.env.PLATFORM_DB_URL;
  if (!url) throw new Error("PLATFORM_DB_URL is not set");
  pool = new Pool({ connectionString: url, max: 5 });
  return pool;
}
