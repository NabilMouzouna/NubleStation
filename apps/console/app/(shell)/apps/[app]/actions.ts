"use server";

import { redirect } from "next/navigation";
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

export async function deleteAppAction(appId: string): Promise<void> {
  const pool = getPlatformPool();
  // CASCADE in the schema handles api_keys, deployments, app_tables, etc.
  await pool.query(`DELETE FROM platform.apps WHERE id = $1`, [appId]);
  redirect("/apps");
}
