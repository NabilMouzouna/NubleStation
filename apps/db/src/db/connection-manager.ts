import type { PoolClient } from "pg";
import { z } from "zod";
import { getPool } from "./pool.js";

const uuidSchema = z.string().uuid();

/**
 * Runs `fn` inside an explicit transaction with the tenant context bound
 * via `set_config('app.current_tenant', $appId, true)`. The `true` third
 * argument scopes the setting to the transaction — semantically identical
 * to `SET LOCAL app.current_tenant`, but parameterized to avoid string
 * interpolation. Cite: ADR 003 §5.
 *
 * The tenant variable is auto-cleared on COMMIT or ROLLBACK, so the
 * connection is safe to return to the pool.
 */
export async function withTenant<T>(
  appId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const parsed = uuidSchema.safeParse(appId);
  if (!parsed.success) {
    throw new Error(`withTenant: appId must be a UUID, got ${JSON.stringify(appId)}`);
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [appId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // best-effort; the original error is what matters
    }
    throw err;
  } finally {
    client.release();
  }
}
