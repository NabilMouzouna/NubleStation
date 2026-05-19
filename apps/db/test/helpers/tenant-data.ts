import type pg from "pg";

/**
 * Drops and recreates `tenant_data.tasks` with the auto-generated RLS policy
 * shape specified in ADR 003 §5. Used by the cross-tenant isolation tests.
 *
 * The policy filters reads/writes by `app_id = current_setting('app.current_tenant')::uuid`,
 * and `WITH CHECK` blocks inserts/updates that would write a row under another tenant's id.
 */
export async function resetTenantData(pool: pg.Pool): Promise<void> {
  // CASCADE handles any FKs against tenant_data.tasks added by future fixtures.
  await pool.query("DROP SCHEMA IF EXISTS tenant_data CASCADE");
  await pool.query("CREATE SCHEMA tenant_data");
  await pool.query(`
    CREATE TABLE tenant_data.tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      app_id uuid NOT NULL,
      title text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query("CREATE INDEX tasks_app_id_idx ON tenant_data.tasks (app_id)");
  await pool.query("ALTER TABLE tenant_data.tasks ENABLE ROW LEVEL SECURITY");
  await pool.query("ALTER TABLE tenant_data.tasks FORCE ROW LEVEL SECURITY");
  await pool.query(`
    CREATE POLICY tenant_isolation ON tenant_data.tasks
      USING (app_id = current_setting('app.current_tenant')::uuid)
      WITH CHECK (app_id = current_setting('app.current_tenant')::uuid);
  `);
}
