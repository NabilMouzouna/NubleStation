"use server";

import { rm } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hash } from "@node-rs/argon2";
import { getPlatformPool } from "@/lib/platform/db";
import { callVault } from "@/lib/internal/vault";
import { validateSession } from "@/lib/auth/session";

export async function revokeApiKeyAction(keyId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const pool = getPlatformPool();
    await pool.query(
      `UPDATE platform.api_keys SET revoked_at = NOW() WHERE id = $1`,
      [keyId],
    );
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to revoke key." };
  }
}

export async function generateApiKeyAction(
  appId: string,
  label?: string,
): Promise<{ ok: boolean; apiKey?: string; error?: string }> {
  try {
    const pool = getPlatformPool();
    const keyId = randomBytes(8).toString("hex");
    const secret = randomBytes(32).toString("base64url");
    const secretHash = await hash(secret);
    await pool.query(
      `INSERT INTO platform.api_keys (app_id, key_id, secret_hash, label) VALUES ($1, $2, $3, $4)`,
      [appId, keyId, secretHash, label ?? "Generated key"],
    );
    return { ok: true, apiKey: `nbl_${keyId}.${secret}` };
  } catch {
    return { ok: false, error: "Failed to generate key." };
  }
}

// ---------------------------------------------------------------------------
// Vault actions
// ---------------------------------------------------------------------------

export async function deleteFileAction(
  appId: string,
  appSlug: string,
  collection: string,
  filename: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await callVault({ method: "DELETE", path: `/v1/vault/files/${collection}/${filename}`, appId, appSlug });
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to delete file." };
  }
}

export async function togglePublicAction(
  appId: string,
  appSlug: string,
  collection: string,
  filename: string,
  isPublic: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const body = new TextEncoder().encode(JSON.stringify({ isPublic }));
    await callVault({ method: "PATCH", path: `/v1/vault/files/${collection}/${filename}`, body, contentType: "application/json", appId, appSlug });
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to update file." };
  }
}

export async function saveVaultSettingsAction(
  appId: string,
  allowedExtensions: string[],
  maxFileMb: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const pool = getPlatformPool();
    await pool.query(
      `INSERT INTO platform.vault_settings (app_id, allowed_extensions, max_file_bytes)
       VALUES ($1, $2, $3)
       ON CONFLICT (app_id) DO UPDATE
         SET allowed_extensions = EXCLUDED.allowed_extensions,
             max_file_bytes     = EXCLUDED.max_file_bytes`,
      [appId, allowedExtensions, maxFileMb * 1024 * 1024],
    );
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save settings." };
  }
}

// ---------------------------------------------------------------------------
// Identity — per-app user access (ADR 014)
// ---------------------------------------------------------------------------

type AccessResult = { ok: boolean; error?: string };

async function audit(
  actorUserId: string,
  appId: string,
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await getPlatformPool().query(
    `INSERT INTO platform.audit_log (actor_user_id, app_id, action, payload)
     VALUES ($1, $2, $3, $4)`,
    [actorUserId, appId, action, payload],
  );
}

/** Grants (or updates) an end-user's role on this app, looked up by email. */
export async function grantUserAccessAction(
  appId: string,
  appSlug: string,
  email: string,
  role: string,
): Promise<AccessResult> {
  const session = await validateSession();
  if (!session) return { ok: false, error: "Not authorized." };

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return { ok: false, error: "Email is required." };

  const pool = getPlatformPool();
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM platform.users WHERE email = $1`,
    [normalizedEmail],
  );
  const userId = rows[0]?.id;
  if (!userId) return { ok: false, error: "No account exists with that email." };

  await pool.query(
    `INSERT INTO platform.user_app_access (user_id, app_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, app_id) DO UPDATE SET role = EXCLUDED.role`,
    [userId, appId, role],
  );
  await audit(session.userId, appId, "user_access.grant", { userId, email: normalizedEmail, role });
  revalidatePath(`/apps/${appSlug}`);
  return { ok: true };
}

/** Changes an existing grant's role. */
export async function changeUserRoleAction(
  appId: string,
  appSlug: string,
  userId: string,
  role: string,
): Promise<AccessResult> {
  const session = await validateSession();
  if (!session) return { ok: false, error: "Not authorized." };

  await getPlatformPool().query(
    `UPDATE platform.user_app_access SET role = $1 WHERE user_id = $2 AND app_id = $3`,
    [role, userId, appId],
  );
  await audit(session.userId, appId, "user_access.change_role", { userId, role });
  revalidatePath(`/apps/${appSlug}`);
  return { ok: true };
}

/** Revokes an end-user's access to this app. */
export async function revokeUserAccessAction(
  appId: string,
  appSlug: string,
  userId: string,
): Promise<AccessResult> {
  const session = await validateSession();
  if (!session) return { ok: false, error: "Not authorized." };

  await getPlatformPool().query(
    `DELETE FROM platform.user_app_access WHERE user_id = $1 AND app_id = $2`,
    [userId, appId],
  );
  await audit(session.userId, appId, "user_access.revoke", { userId });
  revalidatePath(`/apps/${appSlug}`);
  return { ok: true };
}

export async function deleteAppAction(appId: string): Promise<void> {
  const pool = getPlatformPool();

  // Fetch slug before deleting so we can clean up storage.
  const { rows } = await pool.query<{ name: string }>(
    `SELECT name FROM platform.apps WHERE id = $1`,
    [appId],
  );
  const slug = rows[0]?.name;

  // CASCADE handles api_keys, deployments, app_tables.
  await pool.query(`DELETE FROM platform.apps WHERE id = $1`, [appId]);

  // Best-effort: remove deployed files from Orbit storage volume.
  if (slug && process.env.ORBIT_STORAGE_ROOT) {
    const appDir = join(process.env.ORBIT_STORAGE_ROOT, slug);
    await rm(appDir, { recursive: true, force: true });
  }

  redirect("/apps");
}
