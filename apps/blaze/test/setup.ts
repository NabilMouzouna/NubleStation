import { afterAll, beforeAll, beforeEach } from "vitest";
import { closePool, getPool } from "../src/db/pool.js";
import { runPlatformMigrations } from "../src/db/migrate.js";
import { resetTenantData } from "./helpers/tenant-data.js";

// Vitest sets NODE_ENV=test by default, which makes apps/blaze/src/config.ts pick
// DATABASE_URL_TEST. .env.local must define it.

beforeAll(async () => {
  const pool = getPool();
  await runPlatformMigrations(pool);
});

beforeEach(async () => {
  const pool = getPool();
  // Wipe platform state. RESTART IDENTITY is harmless (we use uuid PKs) but
  // makes intent explicit. CASCADE drops nothing real here because tenant_data
  // tables are recreated below.
  await pool.query(`
    TRUNCATE TABLE
      platform.audit_log,
      platform.migrations,
      platform.app_tables,
      platform.deployments,
      platform.user_app_access,
      platform.api_keys,
      platform.apps,
      platform.users,
      platform.organizations
    RESTART IDENTITY CASCADE;
  `);
  // schema_version intentionally NOT truncated — runPlatformMigrations() is a noop
  // after the first run because the journal records are persistent, but the
  // platform.schema_version row should remain to model production state.
  await resetTenantData(pool);
});

afterAll(async () => {
  await closePool();
});
