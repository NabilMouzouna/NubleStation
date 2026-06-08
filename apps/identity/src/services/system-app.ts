import { loadConfig } from "../config.js";
import { getPool } from "../db/pool.js";

let _systemAppId: string | null = null;

/**
 * Ensures the reserved system app exists (idempotent) and caches its UUID.
 * Avatars are stored in this app's Vault bucket so they are cross-app rather
 * than scoped to whichever app a user registered from (ADR 014 §5).
 * Called once at boot.
 */
export async function ensureSystemApp(): Promise<string> {
  const cfg = loadConfig();
  const pool = getPool();

  await pool.query(
    `INSERT INTO platform.apps (name, display_name)
     VALUES ($1, $2)
     ON CONFLICT (name) DO NOTHING`,
    [cfg.IDENTITY_SYSTEM_APP_SLUG, "Identity System"],
  );

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM platform.apps WHERE name = $1`,
    [cfg.IDENTITY_SYSTEM_APP_SLUG],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("failed to resolve identity system app id");
  _systemAppId = id;
  return id;
}

export function getSystemAppId(): string {
  if (!_systemAppId) throw new Error("system app not initialized — call ensureSystemApp() at boot");
  return _systemAppId;
}
