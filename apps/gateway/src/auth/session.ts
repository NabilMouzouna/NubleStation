import { sha256Hex } from "@nublestation/shared";
import { getPool } from "../db.js";

const SESSION_COOKIE = "nuble_session";

/**
 * Parses the raw Cookie header and returns the value of `nuble_session`, or
 * undefined if absent. Kept dependency-free — the gateway proxy works on raw
 * Request objects, not a Hono context.
 */
export function getSessionToken(cookieHeader: string | null | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name === SESSION_COOKIE) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/**
 * Resolves a session cookie to the real Identity user_id, mirroring Identity's
 * `resolveSession` (ADR 014/016): the cookie carries a raw token; we look up its
 * sha256 in platform.sessions and reject if missing or expired. Returns null on
 * any failure so the caller can fall back to anonymous.
 *
 * This is the keystone of per-user Vault ownership: an API key scopes a request
 * to an app, the cookie adds *who* — without it Vault only ever saw the app.
 */
export async function resolveSessionUser(
  cookieHeader: string | null | undefined,
): Promise<string | null> {
  const token = getSessionToken(cookieHeader);
  if (!token) return null;

  const hash = sha256Hex(token);
  const r = await getPool().query<{ user_id: string; expires_at: string }>(
    `SELECT user_id, expires_at FROM platform.sessions WHERE token_hash = $1`,
    [hash],
  );
  const row = r.rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  return row.user_id;
}
