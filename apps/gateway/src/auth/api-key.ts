import { verify as argon2Verify } from "@node-rs/argon2";
import { parseBearerToken, type ParsedApiKey } from "@nublestation/shared";
import { getPool } from "../db.js";

export interface ResolvedKey {
  apiKeyId: string;
  appId: string;
}

interface KeyRow {
  id: string;
  app_id: string;
  secret_hash: string;
  expires_at: string | null;
  revoked_at: string | null;
}

/**
 * Looks up an api_keys row by its plaintext `key_id`, then Argon2-verifies the
 * presented secret. Returns null on any mismatch — the caller surfaces a single
 * generic 401 so we don't leak whether the key_id or the secret was wrong.
 *
 * ADR 003 §4 (api_keys) + §14 (gateway resolution).
 */
export async function resolveApiKey(
  authHeader: string | null | undefined,
): Promise<ResolvedKey | null> {
  const parsed: ParsedApiKey | null = parseBearerToken(authHeader);
  if (!parsed) return null;

  const result = await getPool().query<KeyRow>(
    "SELECT id, app_id, secret_hash, expires_at, revoked_at FROM platform.api_keys WHERE key_id = $1",
    [parsed.keyId],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  const ok = await argon2Verify(row.secret_hash, parsed.secret);
  if (!ok) return null;

  return { apiKeyId: row.id, appId: row.app_id };
}
