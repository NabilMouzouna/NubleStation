import { verify as argon2Verify } from "@node-rs/argon2";
import { parseBearerToken, type ParsedApiKey } from "@nublestation/shared";
import { getPool } from "../db.js";

export interface ResolvedKey {
  apiKeyId: string;
  appId: string;
  appSlug: string;
}

interface KeyRow {
  id: string;
  app_id: string;
  secret_hash: string;
  expires_at: string | null;
  revoked_at: string | null;
  app_name: string;
}

/**
 * Looks up an api_keys row by its plaintext `key_id`, JOINs with platform.apps
 * to resolve the app slug, then Argon2-verifies the presented secret. Returns
 * null on any mismatch — the caller surfaces a single generic 401.
 *
 * ADR 003 §4 (api_keys) + §14 (gateway resolution).
 */
export async function resolveApiKey(
  authHeader: string | null | undefined,
): Promise<ResolvedKey | null> {
  const parsed: ParsedApiKey | null = parseBearerToken(authHeader);
  if (!parsed) return null;

  const result = await getPool().query<KeyRow>(
    `SELECT ak.id, ak.app_id, ak.secret_hash, ak.expires_at, ak.revoked_at,
            a.name AS app_name
     FROM platform.api_keys ak
     JOIN platform.apps a ON a.id = ak.app_id
     WHERE ak.key_id = $1`,
    [parsed.keyId],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  const ok = await argon2Verify(row.secret_hash, parsed.secret);
  if (!ok) return null;

  return { apiKeyId: row.id, appId: row.app_id, appSlug: row.app_name };
}
