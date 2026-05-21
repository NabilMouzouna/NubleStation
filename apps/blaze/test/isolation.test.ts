import { describe, expect, it } from "vitest";
import { withTenant } from "../src/db/connection-manager.js";
import { getPool } from "../src/db/pool.js";
import { seedTwoApps } from "./helpers/seed.js";

/**
 * ADR 003 §20 Phase 1 Step 4 — the gate. Two apps share one physical
 * tenant_data.tasks table, partitioned by app_id with an RLS policy. Within
 * withTenant(appA), queries must only see app A's rows; cross-tenant INSERT
 * must be rejected by `WITH CHECK`.
 */
describe("cross-tenant isolation (RLS)", () => {
  it("each tenant sees only its own rows", async () => {
    const { appA, appB } = await seedTwoApps(getPool());

    await withTenant(appA, async (c) => {
      await c.query(
        "INSERT INTO tenant_data.tasks (app_id, title) VALUES (current_setting('app.current_tenant')::uuid, $1)",
        ["A only"],
      );
    });
    await withTenant(appB, async (c) => {
      await c.query(
        "INSERT INTO tenant_data.tasks (app_id, title) VALUES (current_setting('app.current_tenant')::uuid, $1)",
        ["B #1"],
      );
      await c.query(
        "INSERT INTO tenant_data.tasks (app_id, title) VALUES (current_setting('app.current_tenant')::uuid, $1)",
        ["B #2"],
      );
    });

    const aCount = await withTenant(appA, async (c) => {
      const r = await c.query<{ count: string }>(
        "SELECT count(*)::text FROM tenant_data.tasks",
      );
      return Number(r.rows[0]!.count);
    });
    const bCount = await withTenant(appB, async (c) => {
      const r = await c.query<{ count: string }>(
        "SELECT count(*)::text FROM tenant_data.tasks",
      );
      return Number(r.rows[0]!.count);
    });

    expect(aCount).toBe(1);
    expect(bCount).toBe(2);
  });

  it("WITH CHECK rejects an insert under another tenant's app_id", async () => {
    const { appA, appB } = await seedTwoApps(getPool());

    await expect(
      withTenant(appA, async (c) => {
        await c.query(
          "INSERT INTO tenant_data.tasks (app_id, title) VALUES ($1, $2)",
          [appB, "smuggled"],
        );
      }),
    ).rejects.toMatchObject({
      // SQLSTATE 42501 = insufficient_privilege (RLS WITH CHECK violation)
      code: "42501",
    });

    // Confirm nothing was written, asking under each tenant separately
    // (the table has FORCE RLS, so a query outside any tenant context fails
    // by design — we can't read it "globally").
    const aSeen = await withTenant(appA, async (c) => {
      const r = await c.query<{ count: string }>(
        "SELECT count(*)::text FROM tenant_data.tasks",
      );
      return Number(r.rows[0]!.count);
    });
    const bSeen = await withTenant(appB, async (c) => {
      const r = await c.query<{ count: string }>(
        "SELECT count(*)::text FROM tenant_data.tasks",
      );
      return Number(r.rows[0]!.count);
    });
    expect(aSeen).toBe(0);
    expect(bSeen).toBe(0);
  });

  it("UPDATE under tenant A cannot touch tenant B rows", async () => {
    const { appA, appB } = await seedTwoApps(getPool());
    await withTenant(appA, async (c) => {
      await c.query(
        "INSERT INTO tenant_data.tasks (app_id, title) VALUES (current_setting('app.current_tenant')::uuid, $1)",
        ["A"],
      );
    });
    await withTenant(appB, async (c) => {
      await c.query(
        "INSERT INTO tenant_data.tasks (app_id, title) VALUES (current_setting('app.current_tenant')::uuid, $1)",
        ["B"],
      );
    });

    const affected = await withTenant(appA, async (c) => {
      const r = await c.query("UPDATE tenant_data.tasks SET title = 'x'");
      return r.rowCount ?? 0;
    });
    expect(affected).toBe(1);

    // B's row must still have its original title — superuser-bypass disabled by
    // FORCE ROW LEVEL SECURITY, but we read it via tenant B for symmetry.
    const bTitle = await withTenant(appB, async (c) => {
      const r = await c.query<{ title: string }>(
        "SELECT title FROM tenant_data.tasks LIMIT 1",
      );
      return r.rows[0]!.title;
    });
    expect(bTitle).toBe("B");
  });
});
