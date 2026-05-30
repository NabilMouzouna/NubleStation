import { Writable } from "node:stream";
import busboy from "busboy";
import { fileTypeFromBuffer } from "file-type";
import { Hono } from "hono";
import { z } from "zod";
import { getPool } from "../db/pool.js";
import {
  deleteFileMeta,
  fileExistsInDb,
  getFile,
  getSettings,
  insertFile,
  listFiles,
  setPublic,
} from "../services/db.js";
import {
  fileExtension,
  pathExists,
  removeFile,
  resolveFilePath,
  saveFile,
} from "../services/storage.js";
import { loadConfig } from "../config.js";
import type { HonoVariables } from "../types.js";

export const files = new Hono<{ Variables: HonoVariables }>();

const MAX_BYTES_HARD = 200 * 1024 * 1024; // hard ceiling — settings can only lower this

// ---------------------------------------------------------------------------
// Upload
// POST /v1/vault/files/:collection/:filename
// ---------------------------------------------------------------------------

files.post("/v1/vault/files/:collection/:filename", async (c) => {
  const cfg      = loadConfig();
  const log      = c.var.log;
  const appId    = c.var.appId;
  const appSlug  = c.req.header("x-nuble-app-slug") ?? appId;
  const { collection, filename } = c.req.param();

  // Content-type check first — no DB call needed to fail fast
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return c.json({ ok: false, error: "invalid_content_type" }, 400);
  }

  // Validate path segments up-front
  try {
    resolveFilePath(cfg.STORAGE_ROOT, appSlug, collection, filename);
  } catch (err) {
    const code = (err as { code?: string }).code ?? "invalid_path";
    return c.json({ ok: false, error: code }, 400);
  }

  // Load per-app settings
  const settings = await getSettings(getPool(), appId);

  // Extension check
  if (settings.allowed_extensions.length > 0) {
    const ext = fileExtension(filename);
    if (!settings.allowed_extensions.includes(ext)) {
      return c.json({ ok: false, error: "extension_not_allowed" }, 415);
    }
  }

  let fileBytes: Uint8Array;
  try {
    fileBytes = await extractFile(c.req.raw, contentType, settings.max_file_bytes);
  } catch (err) {
    const e = err as { code?: string; status?: number };
    return c.json({ ok: false, error: e.code ?? "upload_error" }, (e.status ?? 400) as 400);
  }

  // Detect real MIME type from bytes
  const detected  = await fileTypeFromBuffer(fileBytes);
  const mimeType  = detected?.mime ?? c.req.header("x-file-mime") ?? "application/octet-stream";

  // Conflict check
  const exists = await fileExistsInDb(getPool(), appId, collection, filename);
  if (exists) {
    return c.json({ ok: false, error: "file_already_exists" }, 409);
  }

  // Save to disk
  const filePath = resolveFilePath(cfg.STORAGE_ROOT, appSlug, collection, filename);
  await saveFile(filePath, fileBytes);

  // Persist metadata
  let row;
  try {
    row = await insertFile(getPool(), {
      appId,
      collection,
      filename,
      storagePath: filePath,
      mimeType,
      sizeBytes:   fileBytes.length,
      isPublic:    false,
    });
  } catch (err) {
    // Rollback disk write on DB failure
    await removeFile(filePath).catch(() => undefined);
    log.error({ err, appId, collection, filename }, "db insert failed after disk write");
    return c.json({ ok: false, error: "internal_error" }, 500);
  }

  log.info({ appId, collection, filename, bytes: fileBytes.length }, "file uploaded");
  return c.json({ ok: true, file: toResponse(row) }, 201);
});

// ---------------------------------------------------------------------------
// List all files for app
// GET /v1/vault/files
// ---------------------------------------------------------------------------

files.get("/v1/vault/files", async (c) => {
  const appId = c.var.appId;
  const rows  = await listFiles(getPool(), appId);
  return c.json({ ok: true, files: rows.map(toResponse) });
});

// ---------------------------------------------------------------------------
// List files in a collection
// GET /v1/vault/files/:collection
// ---------------------------------------------------------------------------

files.get("/v1/vault/files/:collection", async (c) => {
  const appId      = c.var.appId;
  const collection = c.req.param("collection");
  const rows       = await listFiles(getPool(), appId, collection);
  return c.json({ ok: true, files: rows.map(toResponse) });
});

// ---------------------------------------------------------------------------
// Download
// GET /v1/vault/files/:collection/:filename
// ---------------------------------------------------------------------------

files.get("/v1/vault/files/:collection/:filename", async (c) => {
  const appId                    = c.var.appId;
  const { collection, filename } = c.req.param();

  const row = await getFile(getPool(), appId, collection, filename);
  if (!row) return c.json({ ok: false, error: "not_found" }, 404);

  const exists = await pathExists(row.storage_path);
  if (!exists) return c.json({ ok: false, error: "file_missing_on_disk" }, 500);

  const { readFileBytes } = await import("../services/storage.js");
  const data = await readFileBytes(row.storage_path);

  const mime = row.mime_type ?? "application/octet-stream";
  return new Response(data, {
    status: 200,
    headers: {
      "content-type":        mime,
      "content-length":      String(data.byteLength),
      "content-disposition": `inline; filename="${filename}"`,
    },
  });
});

// ---------------------------------------------------------------------------
// Toggle public / private
// PATCH /v1/vault/files/:collection/:filename
// ---------------------------------------------------------------------------

const patchSchema = z.object({ isPublic: z.boolean() });

files.patch("/v1/vault/files/:collection/:filename", async (c) => {
  const appId                    = c.var.appId;
  const { collection, filename } = c.req.param();

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: "invalid_body" }, 400);
  }

  const row = await setPublic(getPool(), appId, collection, filename, parsed.data.isPublic);
  if (!row) return c.json({ ok: false, error: "not_found" }, 404);

  return c.json({ ok: true, file: toResponse(row) });
});

// ---------------------------------------------------------------------------
// Delete
// DELETE /v1/vault/files/:collection/:filename
// ---------------------------------------------------------------------------

files.delete("/v1/vault/files/:collection/:filename", async (c) => {
  const cfg                      = loadConfig();
  const log                      = c.var.log;
  const appId                    = c.var.appId;
  const appSlug                  = c.req.header("x-nuble-app-slug") ?? appId;
  const { collection, filename } = c.req.param();

  const row = await deleteFileMeta(getPool(), appId, collection, filename);
  if (!row) return c.json({ ok: false, error: "not_found" }, 404);

  // Best-effort disk cleanup — metadata is already gone
  const filePath = resolveFilePath(cfg.STORAGE_ROOT, appSlug, collection, filename);
  await removeFile(filePath).catch((err) => {
    log.warn({ err, appId, collection, filename }, "file deleted from db but disk remove failed");
  });

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function extractFile(
  req: Request,
  contentType: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const bb = busboy({
    headers: { "content-type": contentType },
    limits: { fileSize: Math.min(maxBytes, MAX_BYTES_HARD) },
  });

  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let found = false;

    bb.on("file", (fieldname, stream) => {
      if (fieldname !== "file") { stream.resume(); return; }
      found = true;
      stream.on("data",  (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => reject(Object.assign(new Error("file_too_large"), { code: "file_too_large", status: 413 })));
      stream.on("error", reject);
    });

    bb.on("finish", () => {
      if (!found) return reject(Object.assign(new Error("missing_file_field"), { code: "missing_file_field", status: 400 }));
      resolve(new Uint8Array(Buffer.concat(chunks)));
    });

    bb.on("error", reject);

    req.arrayBuffer().then((ab) => {
      const w = new Writable({
        write(chunk, _enc, cb) { bb.write(chunk, cb); },
        final(cb) { bb.end(); cb(); },
      });
      w.write(Buffer.from(ab));
      w.end();
    }).catch(reject);
  });
}

function toResponse(row: Awaited<ReturnType<typeof getFile>>) {
  if (!row) return null;
  return {
    id:         row.id,
    collection: row.collection,
    filename:   row.filename,
    mimeType:   row.mime_type,
    sizeBytes:  row.size_bytes,
    isPublic:   row.is_public,
    createdAt:  row.created_at,
  };
}
