import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import db from "@/lib/db";

const COOKIE_NAME = "nuble_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AdminSession {
  sessionId: string;
  expires_at: number;
  id: string;
  email: string;
  role: "super_admin" | "admin";
  org_id: string;
}

export async function createSession(adminId: string): Promise<void> {
  const id = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;

  db.prepare(
    `INSERT INTO admin_sessions (id, admin_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(id, adminId, expiresAt, Date.now());

  (await cookies()).set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
    path: "/",
  });
}

export async function validateSession(): Promise<AdminSession | null> {
  const sessionId = (await cookies()).get(COOKIE_NAME)?.value;
  if (!sessionId) return null;

  const row = db
    .prepare(
      `SELECT s.id as sessionId, s.expires_at,
              u.id, u.email, u.role, u.org_id
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.admin_id
       WHERE s.id = ? AND s.expires_at > ?`
    )
    .get(sessionId, Date.now()) as AdminSession | undefined;

  return row ?? null;
}

export async function destroySession(): Promise<void> {
  const sessionId = (await cookies()).get(COOKIE_NAME)?.value;
  if (sessionId) {
    db.prepare(`DELETE FROM admin_sessions WHERE id = ?`).run(sessionId);
  }
  (await cookies()).delete(COOKIE_NAME);
}
