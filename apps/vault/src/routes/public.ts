import { Hono } from "hono";
import { getPool } from "../db/pool.js";
import { getPublicFile } from "../services/db.js";
import { pathExists, readFileBytes } from "../services/storage.js";

export const pub = new Hono();

/**
 * Public file serving — no HMAC, no API key.
 * Gateway forwards /vault/:appSlug/:collection/:filename here directly.
 * Returns 403 if the file exists but is not public.
 */
pub.get("/vault/:appSlug/:collection/:filename", async (c) => {
  const { appSlug, collection, filename } = c.req.param();

  const row = await getPublicFile(getPool(), appSlug, collection, filename);

  if (!row) return c.json({ ok: false, error: "not_found" }, 404);
  if (!row.is_public) return c.json({ ok: false, error: "forbidden" }, 403);

  const exists = await pathExists(row.storage_path);
  if (!exists) return c.json({ ok: false, error: "file_missing_on_disk" }, 500);

  const data = await readFileBytes(row.storage_path);

  return new Response(data, {
    status: 200,
    headers: {
      "content-type":        row.mime_type ?? "application/octet-stream",
      "content-length":      String(data.byteLength),
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control":       "no-store",
    },
  });
});
