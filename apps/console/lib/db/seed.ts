import { getPool } from "./index.js";

export async function ensureSuperAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const hash = process.env.ADMIN_PASSWORD_HASH;

  if (!email || !hash) {
    console.warn("[seed] ADMIN_EMAIL or ADMIN_PASSWORD_HASH not set — skipping super admin seed");
    return;
  }

  const pool = getPool();
  await pool.query(
    `INSERT INTO platform.users (email, password_hash, role, display_name, is_active)
     VALUES ($1, $2, 'super_admin', 'Super Admin', true)
     ON CONFLICT (email) DO NOTHING`,
    [email, hash],
  );

  console.log("[seed] super admin ready:", email);
}
