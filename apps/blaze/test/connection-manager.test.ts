import { describe, expect, it } from "vitest";
import { withTenant } from "../src/db/connection-manager.js";
import { getPool } from "../src/db/pool.js";
import { seedTwoApps } from "./helpers/seed.js";

describe("withTenant", () => {
  it("sets app.current_tenant inside the transaction", async () => {
    const { appA } = await seedTwoApps(getPool());
    const observed = await withTenant(appA, async (c) => {
      const r = await c.query<{ tenant: string }>(
        "SELECT current_setting('app.current_tenant') AS tenant",
      );
      return r.rows[0]!.tenant;
    });
    expect(observed).toBe(appA);
  });

  it("clears app.current_tenant after COMMIT (no leak to next withTenant)", async () => {
    const { appA } = await seedTwoApps(getPool());
    await withTenant(appA, async (c) => {
      await c.query("SELECT 1");
    });
    // Run a query on the pool *outside* withTenant — should see no tenant set.
    // current_setting('name', true) returns '' (empty) when missing instead of erroring.
    const r = await getPool().query<{ tenant: string }>(
      "SELECT current_setting('app.current_tenant', true) AS tenant",
    );
    expect(r.rows[0]!.tenant).toBe("");
  });

  it("clears app.current_tenant after ROLLBACK", async () => {
    const { appA } = await seedTwoApps(getPool());
    await expect(
      withTenant(appA, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const r = await getPool().query<{ tenant: string }>(
      "SELECT current_setting('app.current_tenant', true) AS tenant",
    );
    expect(r.rows[0]!.tenant).toBe("");
  });

  it("rejects a non-UUID appId before opening a transaction", async () => {
    await expect(
      withTenant("not-a-uuid", async () => "should-not-run"),
    ).rejects.toThrow(/appId must be a UUID/);
  });
});
