import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { getPlatformPool } from "./db";

// Reserved internal app that owns the Identity avatar bucket (ADR 014).
// Hidden from all user-facing app listings.
export const SYSTEM_APP_SLUG = "identity-system";

export interface AppRow {
  id: string;
  name: string;
  display_name: string;
  created_at: string;
  has_deployment: boolean;
}

export async function listApps(): Promise<AppRow[]> {
  const pool = getPlatformPool();
  const { rows } = await pool.query<AppRow>(
    `SELECT a.id, a.name, a.display_name, a.created_at,
            (EXISTS (SELECT 1 FROM platform.deployments d WHERE d.app_id = a.id)) AS has_deployment
     FROM platform.apps a
     WHERE a.name <> $1
     ORDER BY a.created_at DESC`,
    [SYSTEM_APP_SLUG],
  );
  return rows;
}

export interface CreateAppResult {
  appId: string;
  apiKey: string; // plaintext — shown once, never stored
}

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export async function createApp(
  displayName: string,
  slug: string,
): Promise<CreateAppResult> {
  if (!SLUG_RE.test(slug)) throw new Error("invalid_slug");
  if (!displayName.trim()) throw new Error("display_name_required");

  const pool = getPlatformPool();

  // 1. Insert app row.
  const appResult = await pool.query<{ id: string }>(
    `INSERT INTO platform.apps (name, display_name)
     VALUES ($1, $2)
     RETURNING id`,
    [slug, displayName.trim()],
  );
  const appId = appResult.rows[0]!.id;

  // 2. Generate API key: nbl_<keyId>.<secret>
  const keyId = randomBytes(8).toString("hex"); // 16-char hex
  const secret = randomBytes(32).toString("base64url"); // 43-char url-safe
  const secretHash = await hash(secret);

  // 3. Store hashed key.
  await pool.query(
    `INSERT INTO platform.api_keys (app_id, key_id, secret_hash, label)
     VALUES ($1, $2, $3, $4)`,
    [appId, keyId, secretHash, "Default key"],
  );

  return { appId, apiKey: `nbl_${keyId}.${secret}` };
}
