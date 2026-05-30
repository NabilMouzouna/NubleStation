import pg from "pg";
import { loadConfig } from "../config.js";

let _pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (_pool) return _pool;
  const cfg = loadConfig();
  _pool = new pg.Pool({ connectionString: cfg.DATABASE_URL, max: 5 });
  return _pool;
}
