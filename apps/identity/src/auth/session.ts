import { randomBytes } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { sha256Hex } from "@nublestation/shared";
import { loadConfig } from "../config.js";
import { getPool } from "../db/pool.js";

export const SESSION_COOKIE = "nuble_session";

/**
 * Session security model (ADR 014):
 * - The cookie carries a 32-byte CSPRNG token; the DB stores only its sha256.
 *   A read of platform.sessions cannot reconstruct a usable cookie.
 * - Sessions are server-side and revocable (logout deletes the row; admin
 *   force-logout deletes all rows for a user).
 * - The token is rotated on every login (session-fixation defense) — callers
 *   delete the old session before creating a new one.
 */

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Creates a session row and returns the raw token + expiry. Store the raw
 *  token in the cookie only — never in the DB. */
export async function createSession(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const cfg = loadConfig();
  const token = newToken();
  const expiresAt = new Date(Date.now() + cfg.SESSION_TTL_HOURS * 60 * 60 * 1000);
  await getPool().query(
    `INSERT INTO platform.sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, sha256Hex(token), expiresAt],
  );
  return { token, expiresAt };
}

/** Resolves a raw token to a userId, or null if missing/expired. Expired rows
 *  are deleted opportunistically. */
export async function resolveSession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const hash = sha256Hex(token);
  const { rows } = await getPool().query<{ user_id: string; expires_at: string }>(
    `SELECT user_id, expires_at FROM platform.sessions WHERE token_hash = $1`,
    [hash],
  );
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await getPool().query(`DELETE FROM platform.sessions WHERE token_hash = $1`, [hash]);
    return null;
  }
  return row.user_id;
}

/** Deletes a single session (logout). */
export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await getPool().query(`DELETE FROM platform.sessions WHERE token_hash = $1`, [
    sha256Hex(token),
  ]);
}

/** Deletes every session for a user (admin force-logout / password reset). */
export async function deleteUserSessions(userId: string): Promise<void> {
  await getPool().query(`DELETE FROM platform.sessions WHERE user_id = $1`, [userId]);
}

// ── Cookie helpers ───────────────────────────────────────────────────────────
// HTTP-only deployment (ADR 014 §4): HttpOnly + SameSite=Lax always on; Secure
// gated by SECURE_COOKIES (off until HTTPS). Domain=.{org}.local so the cookie
// is sent to every app subdomain (the SSO backbone).

export function setSessionCookie(c: Context, token: string, expiresAt: Date): void {
  const cfg = loadConfig();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: cfg.SECURE_COOKIES,
    domain: `.${cfg.ORG_DOMAIN}.local`,
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context): void {
  const cfg = loadConfig();
  deleteCookie(c, SESSION_COOKIE, {
    domain: `.${cfg.ORG_DOMAIN}.local`,
    path: "/",
  });
}

export function getSessionToken(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}
