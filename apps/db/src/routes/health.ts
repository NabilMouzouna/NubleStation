import { Hono } from "hono";
import { getPool } from "../db/pool.js";
import { logger } from "../logger.js";

export const health = new Hono();

health.get("/healthz", (c) => c.json({ ok: true }));

health.get("/readyz", async (c) => {
  try {
    const pool = getPool();
    const r = await pool.query<{ version: string }>(
      "SELECT version FROM platform.schema_version ORDER BY applied_at DESC LIMIT 1",
    );
    if (r.rowCount === 0) {
      return c.json({ ok: false, reason: "no schema_version row" }, 503);
    }
    return c.json({ ok: true, schemaVersion: r.rows[0]?.version ?? null });
  } catch (e) {
    logger.error({ err: e }, "readyz failed");
    return c.json({ ok: false }, 503);
  }
});
