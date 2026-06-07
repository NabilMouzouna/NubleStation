import { canonicalChecksum } from "@nublestation/blaze";
import type { SerializedSchema } from "@nublestation/blaze";
import { getPool } from "../db/pool.js";
import { generateMigrationSQL } from "./generate.js";
import { ensureWasm, validateMigrationSQL } from "./validate-sql.js";

export interface ApplyResult {
  noOp: boolean;
  statementsApplied: number;
}

export async function applyMigration(
  appId: string,
  curSchema: SerializedSchema,
): Promise<ApplyResult> {
  await ensureWasm();

  const checksum = await canonicalChecksum(curSchema);
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    // Serialize concurrent pushes per app.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `migrations:${appId}`,
    ]);

    // Read previous schema and last checksum in one round-trip.
    const prevResult = await client.query<{
      schema_json: SerializedSchema;
      last_checksum: string | null;
    }>(
      `SELECT COALESCE(
          (SELECT schema_json FROM platform.app_tables WHERE app_id = $1 LIMIT 1),
          NULL
        ) AS schema_json,
        (SELECT checksum FROM platform.migrations
          WHERE app_id = $1 ORDER BY applied_at DESC LIMIT 1
        ) AS last_checksum`,
      [appId],
    );

    const prevRow = prevResult.rows[0];
    const prevSchema = prevRow?.schema_json ?? null;
    const lastChecksum = prevRow?.last_checksum ?? null;

    if (lastChecksum === checksum) {
      await client.query("ROLLBACK");
      return { noOp: true, statementsApplied: 0 };
    }

    const sql = await generateMigrationSQL(prevSchema, curSchema);
    validateMigrationSQL(sql);

    // Ensure blaze_app role and tenant_data schema exist (idempotent).
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'blaze_app') THEN
          CREATE ROLE blaze_app NOLOGIN;
        END IF;
      END $$
    `);
    await client.query("CREATE SCHEMA IF NOT EXISTS tenant_data");
    await client.query("GRANT USAGE ON SCHEMA tenant_data TO blaze_app");

    for (const stmt of sql) {
      await client.query(stmt);
    }

    // Replace app_tables rows for this app (one row per table, globally unique name).
    await client.query("DELETE FROM platform.app_tables WHERE app_id = $1", [appId]);
    const schemaJsonStr = JSON.stringify(curSchema);
    for (const tableName of Object.keys(curSchema.tables)) {
      await client.query(
        "INSERT INTO platform.app_tables (app_id, table_name, schema_json) VALUES ($1, $2, $3::jsonb)",
        [appId, tableName, schemaJsonStr],
      );
    }

    // Record migration.
    const filename = `${Date.now()}_push`;
    await client.query(
      "INSERT INTO platform.migrations (app_id, filename, checksum) VALUES ($1, $2, $3)",
      [appId, filename, checksum],
    );

    await client.query("COMMIT");
    return { noOp: false, statementsApplied: sql.length };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // best-effort
    }
    throw err;
  } finally {
    client.release();
  }
}
