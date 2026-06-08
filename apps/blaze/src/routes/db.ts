import type { SerializedTable } from "@nublestation/blaze";
import { Hono } from "hono";
import { withTenant } from "../db/connection-manager.js";
import {
  buildDelete,
  buildInsert,
  buildSelect,
  buildSelectById,
  buildUpdate,
} from "../db/query-builder.js";
import { getAppSchema, invalidateAppSchema } from "../db/schema-cache.js";
import type { HonoVariables } from "../types.js";

export const db = new Hono<{ Variables: HonoVariables }>();

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

// Reserved columns that may never be set or updated by the client.
const RESERVED = new Set(["id", "app_id"]);

/** Resolves and validates the table from the app's schema. Returns 404 if absent. */
async function resolveTable(
  c: any,
  appId: string,
  tableName: string,
): Promise<{ schema: Awaited<ReturnType<typeof getAppSchema>>; table: SerializedTable } | Response> {
  const schema = await getAppSchema(appId);
  if (!schema) {
    return c.json({ error: "No schema found for this app" }, 404);
  }
  const table = schema.tables[tableName];
  if (!table) {
    return c.json({ error: `Table "${tableName}" not found in schema` }, 404);
  }
  return { schema, table };
}

// GET /v1/blaze/db/:table
db.get("/v1/blaze/db/:table", async (c) => {
  const appId = c.var.appId;
  const tableName = c.req.param("table");

  const resolved = await resolveTable(c, appId, tableName);
  if (!("table" in resolved)) return resolved;

  const raw = c.req.query("limit");
  const limit = Math.min(raw ? parseInt(raw, 10) || DEFAULT_LIMIT : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = parseInt(c.req.query("offset") ?? "0", 10) || 0;

  const rows = await withTenant(appId, async (client) => {
    const q = buildSelect(tableName, limit, offset);
    const res = await client.query(q.sql, q.params);
    return res.rows;
  });

  return c.json({ data: rows });
});

// GET /v1/blaze/db/:table/:id
db.get("/v1/blaze/db/:table/:id", async (c) => {
  const appId = c.var.appId;
  const tableName = c.req.param("table");
  const id = c.req.param("id");

  const resolved = await resolveTable(c, appId, tableName);
  if (!("table" in resolved)) return resolved;

  const row = await withTenant(appId, async (client) => {
    const q = buildSelectById(tableName, id);
    const res = await client.query(q.sql, q.params);
    return res.rows[0] ?? null;
  });

  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row });
});

// POST /v1/blaze/db/:table
db.post("/v1/blaze/db/:table", async (c) => {
  const appId = c.var.appId;
  const tableName = c.req.param("table");

  const resolved = await resolveTable(c, appId, tableName);
  if (!("table" in resolved)) return resolved;
  const { table } = resolved;

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Accept only schema-declared, non-reserved columns.
  const columns: string[] = [];
  const values: unknown[] = [];
  for (const [col, field] of Object.entries(table.fields)) {
    if (RESERVED.has(col)) continue;
    if (col in body) {
      columns.push(col);
      values.push(body[col]);
    } else if (field.required && !field.default) {
      return c.json({ error: `Missing required field: ${col}` }, 422);
    }
  }

  const row = await withTenant(appId, async (client) => {
    const q = buildInsert(tableName, columns, values);
    const res = await client.query(q.sql, q.params);
    return res.rows[0];
  });

  invalidateAppSchema(appId);
  return c.json({ data: row }, 201);
});

// PATCH /v1/blaze/db/:table/:id
db.patch("/v1/blaze/db/:table/:id", async (c) => {
  const appId = c.var.appId;
  const tableName = c.req.param("table");
  const id = c.req.param("id");

  const resolved = await resolveTable(c, appId, tableName);
  if (!("table" in resolved)) return resolved;
  const { table } = resolved;

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const columns: string[] = [];
  const values: unknown[] = [];
  for (const col of Object.keys(body)) {
    if (RESERVED.has(col)) continue;
    if (!(col in table.fields)) continue; // ignore unknown fields silently
    columns.push(col);
    values.push(body[col]);
  }

  if (!columns.length) return c.json({ error: "No updatable fields in body" }, 422);

  const row = await withTenant(appId, async (client) => {
    const q = buildUpdate(tableName, id, columns, values);
    const res = await client.query(q.sql, q.params);
    return res.rows[0] ?? null;
  });

  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row });
});

// DELETE /v1/blaze/db/:table/:id
db.delete("/v1/blaze/db/:table/:id", async (c) => {
  const appId = c.var.appId;
  const tableName = c.req.param("table");
  const id = c.req.param("id");

  const resolved = await resolveTable(c, appId, tableName);
  if (!("table" in resolved)) return resolved;

  const row = await withTenant(appId, async (client) => {
    const q = buildDelete(tableName, id);
    const res = await client.query(q.sql, q.params);
    return res.rows[0] ?? null;
  });

  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: row });
});
