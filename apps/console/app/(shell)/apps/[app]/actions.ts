"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { hash } from "@node-rs/argon2";
import { getPlatformPool } from "@/lib/platform/db";

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

export async function deleteAppAction(appId: string): Promise<void> {
  const pool = getPlatformPool();
  // CASCADE in the schema handles api_keys, deployments, app_tables, etc.
  await pool.query(`DELETE FROM platform.apps WHERE id = $1`, [appId]);
  redirect("/apps");
}
