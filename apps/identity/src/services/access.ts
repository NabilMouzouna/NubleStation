import { getPool } from "../db/pool.js";

const ADMIN_ROLES = new Set(["super_admin", "admin"]);

/**
 * Pure role-resolution rule (ADR 014 §2):
 * - Console admins (super_admin/admin) are implicitly `admin` on every app.
 * - Everyone else gets their explicit per-app grant, or null (default-deny).
 */
export function decideRole(userRole: string, accessRole: string | null): string | null {
  if (ADMIN_ROLES.has(userRole)) return "admin";
  return accessRole;
}

/** Resolves a user's effective role for an app, or null if no access. */
export async function getUserAppRole(userId: string, appId: string): Promise<string | null> {
  const pool = getPool();
  const u = await pool.query<{ role: string }>(
    `SELECT role FROM platform.users WHERE id = $1`,
    [userId],
  );
  const userRole = u.rows[0]?.role;
  if (!userRole) return null;

  const a = await pool.query<{ role: string }>(
    `SELECT role FROM platform.user_app_access WHERE user_id = $1 AND app_id = $2`,
    [userId, appId],
  );
  return decideRole(userRole, a.rows[0]?.role ?? null);
}

export async function resolveAppIdBySlug(slug: string): Promise<string | null> {
  const { rows } = await getPool().query<{ id: string }>(
    `SELECT id FROM platform.apps WHERE name = $1`,
    [slug],
  );
  return rows[0]?.id ?? null;
}
