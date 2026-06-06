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

export interface AppUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
}

/**
 * Users who can be granted access to a resource in this app (ADR 016 share
 * picker): everyone with an explicit grant for the app, plus org admins (who
 * are implicit app-admins). Inactive accounts are excluded.
 */
export async function listAppUsers(appId: string): Promise<AppUser[]> {
  const { rows } = await getPool().query<{
    id: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    role: string;
  }>(
    `SELECT u.id, u.email, u.display_name, u.avatar_url,
            COALESCE(ua.role,
                     CASE WHEN u.role IN ('super_admin','admin') THEN 'admin' END) AS role
     FROM platform.users u
     LEFT JOIN platform.user_app_access ua
       ON ua.user_id = u.id AND ua.app_id = $1
     WHERE u.is_active = true
       AND (ua.app_id IS NOT NULL OR u.role IN ('super_admin','admin'))
     ORDER BY u.display_name NULLS LAST, u.email`,
    [appId],
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    role: r.role,
  }));
}
