import type { SerializedSchema } from "@nublestation/blaze";
import { getPool } from "./pool.js";

interface Entry {
  schema: SerializedSchema;
  expiresAt: number;
}

const cache = new Map<string, Entry>();
const TTL_MS = 30_000;

export async function getAppSchema(appId: string): Promise<SerializedSchema | null> {
  const now = Date.now();
  const hit = cache.get(appId);
  if (hit && hit.expiresAt > now) return hit.schema;

  const result = await getPool().query<{ schema_json: SerializedSchema }>(
    "SELECT schema_json FROM platform.app_tables WHERE app_id = $1 LIMIT 1",
    [appId],
  );

  if (!result.rows.length) return null;

  const schema = result.rows[0]!.schema_json;
  cache.set(appId, { schema, expiresAt: now + TTL_MS });
  return schema;
}

export function invalidateAppSchema(appId: string): void {
  cache.delete(appId);
}
