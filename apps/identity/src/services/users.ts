import { getPool } from "../db/pool.js";
import { hashPassword, verifyPassword } from "../auth/password.js";

export class EmailExistsError extends Error {
  constructor() {
    super("email_exists");
    this.name = "EmailExistsError";
  }
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
}

export interface LoginUser {
  id: string;
  passwordHash: string;
  isActive: boolean;
  role: string;
}

/** Creates an end-user account (default-deny: no app access granted here). */
export async function registerUser(input: {
  email: string;
  password: string;
  displayName: string | null;
}): Promise<{ id: string }> {
  const passwordHash = await hashPassword(input.password);
  try {
    const { rows } = await getPool().query<{ id: string }>(
      `INSERT INTO platform.users (email, password_hash, display_name, role, is_active)
       VALUES ($1, $2, $3, 'end_user', true)
       RETURNING id`,
      [input.email, passwordHash, input.displayName],
    );
    return { id: rows[0]!.id };
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23505") throw new EmailExistsError();
    throw e;
  }
}

export async function findByEmail(email: string): Promise<LoginUser | null> {
  const { rows } = await getPool().query<{
    id: string;
    password_hash: string;
    is_active: boolean;
    role: string;
  }>(
    `SELECT id, password_hash, is_active, role FROM platform.users WHERE email = $1`,
    [email],
  );
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, passwordHash: r.password_hash, isActive: r.is_active, role: r.role };
}

export async function getById(id: string): Promise<PublicUser | null> {
  const { rows } = await getPool().query<{
    id: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    role: string;
  }>(
    `SELECT id, email, display_name, avatar_url, role FROM platform.users WHERE id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, email: r.email, displayName: r.display_name, avatarUrl: r.avatar_url, role: r.role };
}

export async function updateAvatarUrl(id: string, url: string): Promise<void> {
  await getPool().query(`UPDATE platform.users SET avatar_url = $1 WHERE id = $2`, [url, id]);
}

// ── Profile (account page) ───────────────────────────────────────────────────

export interface Profile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: string;
}

export interface UserApp {
  name: string;
  displayName: string;
  role: string;
}

export async function getProfile(id: string): Promise<Profile | null> {
  const { rows } = await getPool().query<{
    id: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    role: string;
    created_at: string;
  }>(
    `SELECT id, email, display_name, avatar_url, role, created_at
     FROM platform.users WHERE id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    role: r.role,
    createdAt: r.created_at,
  };
}

/** Apps this user has an explicit grant on (excludes the internal system app). */
export async function listUserApps(id: string): Promise<UserApp[]> {
  const { rows } = await getPool().query<{ name: string; display_name: string; role: string }>(
    `SELECT a.name, a.display_name, ua.role
     FROM platform.user_app_access ua
     JOIN platform.apps a ON a.id = ua.app_id
     WHERE ua.user_id = $1 AND a.name <> 'identity-system'
     ORDER BY a.display_name`,
    [id],
  );
  return rows.map((r) => ({ name: r.name, displayName: r.display_name, role: r.role }));
}

/** Updates editable profile fields. Throws EmailExistsError on a taken email. */
export async function updateProfile(
  id: string,
  input: { displayName: string | null; email: string },
): Promise<void> {
  try {
    await getPool().query(
      `UPDATE platform.users SET display_name = $1, email = $2 WHERE id = $3`,
      [input.displayName, input.email, id],
    );
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23505") throw new EmailExistsError();
    throw e;
  }
}

/** Changes the password after verifying the current one. Returns false if the
 *  current password is wrong. */
export async function changePassword(
  id: string,
  currentPlain: string,
  newPlain: string,
): Promise<boolean> {
  const { rows } = await getPool().query<{ password_hash: string }>(
    `SELECT password_hash FROM platform.users WHERE id = $1`,
    [id],
  );
  const hash = rows[0]?.password_hash;
  if (!hash) return false;
  if (!(await verifyPassword(hash, currentPlain))) return false;
  await getPool().query(`UPDATE platform.users SET password_hash = $1 WHERE id = $2`, [
    await hashPassword(newPlain),
    id,
  ]);
  return true;
}
