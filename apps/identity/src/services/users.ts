import { getPool } from "../db/pool.js";
import { hashPassword } from "../auth/password.js";

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
