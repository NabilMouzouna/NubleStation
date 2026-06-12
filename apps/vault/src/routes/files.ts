import { Writable } from "node:stream";
import busboy from "busboy";
import { fileTypeFromBuffer } from "file-type";
import { Hono } from "hono";
import { z } from "zod";
import { getPool } from "../db/pool.js";
import {
  canDelete,
  canManage,
  canRead,
  canWrite,
  createGrant,
  deleteFileMeta,
  deleteGrant,
  getFile,
  getSettings,
  insertFile,
  listAccessible,
  listGrants,
  listMine,
  listPublic,
  listSharedWithMe,
  resolveCaller,
  resolveFileAccess,
  setPublic,
  type GrantRole,
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
// ADR 016: the file is stamped with the caller as owner (private by default).
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

  const caller = await resolveCaller(getPool(), appId, c.var.userId);

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

  // Conflict check — the (app, collection, filename) namespace is flat (S3-style)
  const existing = await getFile(getPool(), appId, collection, filename);
  if (existing) {
    // Allow the owner (or an editor with a grant on the path) to overwrite.
    const role = await resolveFileAccess(getPool(), existing, caller);
    if (!canWrite(role)) {
      return c.json({ ok: false, error: "file_already_exists" }, 409);
    }
    await deleteFileMeta(getPool(), appId, collection, filename);
  }

  // Save to disk
  const filePath = resolveFilePath(cfg.STORAGE_ROOT, appSlug, collection, filename);
  await saveFile(filePath, fileBytes);

  // Persist metadata
  let row;
  try {
    row = await insertFile(getPool(), {
      appId,
      ownerId:     caller.userId,
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

  log.info({ appId, owner: caller.userId, collection, filename, bytes: fileBytes.length }, "file uploaded");
  return c.json({ ok: true, file: toResponse(row) }, 201);
});

// ---------------------------------------------------------------------------
// Scoped listings (ADR 016) — registered BEFORE /files/:collection so the
// literal segments ("mine", "shared", "public") are not captured as collections.
// ---------------------------------------------------------------------------

// GET /v1/vault/files/mine[/:collection] — files the caller owns
files.get("/v1/vault/files/mine/:collection?", async (c) => {
  const appId      = c.var.appId;
  const collection = c.req.param("collection");
  const caller     = await resolveCaller(getPool(), appId, c.var.userId);
  if (!caller.userId) return c.json({ ok: true, files: [] });
  const rows = await listMine(getPool(), appId, caller.userId, collection);
  return c.json({ ok: true, files: rows.map((r) => toResponse(r, "owner")) });
});

// GET /v1/vault/files/shared — files shared with the caller
files.get("/v1/vault/files/shared", async (c) => {
  const appId  = c.var.appId;
  const caller = await resolveCaller(getPool(), appId, c.var.userId);
  if (!caller.userId) return c.json({ ok: true, files: [] });
  const rows = await listSharedWithMe(getPool(), appId, caller.userId);
  return c.json({ ok: true, files: rows.map((r) => toResponse(r, r.role)) });
});

// GET /v1/vault/files/public[/:collection] — public files in the app
files.get("/v1/vault/files/public/:collection?", async (c) => {
  const appId      = c.var.appId;
  const collection = c.req.param("collection");
  const rows       = await listPublic(getPool(), appId, collection);
  return c.json({ ok: true, files: rows.map((r) => toResponse(r, "public")) });
});

// ---------------------------------------------------------------------------
// List accessible files for app (communal ∪ own ∪ public ∪ shared; admin = all)
// GET /v1/vault/files
// ---------------------------------------------------------------------------

files.get("/v1/vault/files", async (c) => {
  const appId  = c.var.appId;
  const caller = await resolveCaller(getPool(), appId, c.var.userId);
  const rows   = await listAccessible(getPool(), appId, caller);
  return c.json({ ok: true, files: rows.map((r) => toResponse(r)) });
});

// ---------------------------------------------------------------------------
// List accessible files in a collection
// GET /v1/vault/files/:collection
// ---------------------------------------------------------------------------

files.get("/v1/vault/files/:collection", async (c) => {
  const appId      = c.var.appId;
  const collection = c.req.param("collection");
  const caller     = await resolveCaller(getPool(), appId, c.var.userId);
  const rows       = await listAccessible(getPool(), appId, caller, collection);
  return c.json({ ok: true, files: rows.map((r) => toResponse(r)) });
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

  const caller = await resolveCaller(getPool(), appId, c.var.userId);
  const role   = await resolveFileAccess(getPool(), row, caller);
  if (!canRead(role)) return c.json({ ok: false, error: "forbidden" }, 403);

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
// Toggle public / private — owner only (ADR 016 §5)
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

  const file = await getFile(getPool(), appId, collection, filename);
  if (!file) return c.json({ ok: false, error: "not_found" }, 404);

  const caller = await resolveCaller(getPool(), appId, c.var.userId);
  const role   = await resolveFileAccess(getPool(), file, caller);
  if (!canManage(role)) return c.json({ ok: false, error: "forbidden" }, 403);

  const row = await setPublic(getPool(), appId, collection, filename, parsed.data.isPublic);
  if (!row) return c.json({ ok: false, error: "not_found" }, 404);

  return c.json({ ok: true, file: toResponse(row) });
});

// ---------------------------------------------------------------------------
// Delete — owner, editor, or app-admin (housekeeping)
// DELETE /v1/vault/files/:collection/:filename
// ---------------------------------------------------------------------------

files.delete("/v1/vault/files/:collection/:filename", async (c) => {
  const cfg                      = loadConfig();
  const log                      = c.var.log;
  const appId                    = c.var.appId;
  const appSlug                  = c.req.header("x-nuble-app-slug") ?? appId;
  const { collection, filename } = c.req.param();

  const file = await getFile(getPool(), appId, collection, filename);
  if (!file) return c.json({ ok: false, error: "not_found" }, 404);

  const caller = await resolveCaller(getPool(), appId, c.var.userId);
  const role   = await resolveFileAccess(getPool(), file, caller);
  if (!canDelete(role)) return c.json({ ok: false, error: "forbidden" }, 403);

  await deleteFileMeta(getPool(), appId, collection, filename);

  // Best-effort disk cleanup — metadata is already gone
  const filePath = resolveFilePath(cfg.STORAGE_ROOT, appSlug, collection, filename);
  await removeFile(filePath).catch((err) => {
    log.warn({ err, appId, collection, filename }, "file deleted from db but disk remove failed");
  });

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Sharing (ADR 016 §4)
// ---------------------------------------------------------------------------

const grantSchema = z.object({
  collection: z.string().min(1),
  filename:   z.string().min(1).nullable().optional(),
  granteeUserId: z.string().uuid(),
  role:       z.enum(["viewer", "editor"]),
});

// POST /v1/vault/grants — share a file or whole collection with one user
files.post("/v1/vault/grants", async (c) => {
  const appId  = c.var.appId;
  const caller = await resolveCaller(getPool(), appId, c.var.userId);
  if (!caller.userId) return c.json({ ok: false, error: "unauthenticated" }, 401);

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "invalid_json" }, 400); }
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: "invalid_body" }, 400);

  const { collection, role } = parsed.data;
  const filename = parsed.data.filename ?? null;

  if (parsed.data.granteeUserId === caller.userId) {
    return c.json({ ok: false, error: "cannot_share_with_self" }, 400);
  }

  // File-level grant: the resource must exist and be owned by the caller.
  if (filename) {
    const file = await getFile(getPool(), appId, collection, filename);
    if (!file) return c.json({ ok: false, error: "not_found" }, 404);
    if (file.owner_id !== caller.userId) return c.json({ ok: false, error: "forbidden" }, 403);
  }

  try {
    await createGrant(getPool(), {
      appId,
      ownerId:       caller.userId,
      granteeUserId: parsed.data.granteeUserId,
      collection,
      filename,
      role: role as GrantRole,
    });
  } catch (err) {
    // FK violation → grantee is not a real user
    if ((err as { code?: string }).code === "23503") {
      return c.json({ ok: false, error: "invalid_grantee" }, 400);
    }
    throw err;
  }

  return c.json({ ok: true }, 201);
});

// DELETE /v1/vault/grants — revoke a share
const unshareSchema = z.object({
  collection: z.string().min(1),
  filename:   z.string().min(1).nullable().optional(),
  granteeUserId: z.string().uuid(),
});

files.delete("/v1/vault/grants", async (c) => {
  const appId  = c.var.appId;
  const caller = await resolveCaller(getPool(), appId, c.var.userId);
  if (!caller.userId) return c.json({ ok: false, error: "unauthenticated" }, 401);

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "invalid_json" }, 400); }
  const parsed = unshareSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: "invalid_body" }, 400);

  const removed = await deleteGrant(getPool(), {
    appId,
    ownerId:       caller.userId,
    granteeUserId: parsed.data.granteeUserId,
    collection:    parsed.data.collection,
    filename:      parsed.data.filename ?? null,
  });
  if (!removed) return c.json({ ok: false, error: "not_found" }, 404);
  return c.json({ ok: true });
});

// GET /v1/vault/grants?collection=&filename= — list grants on a resource I own
files.get("/v1/vault/grants", async (c) => {
  const appId  = c.var.appId;
  const caller = await resolveCaller(getPool(), appId, c.var.userId);
  if (!caller.userId) return c.json({ ok: false, error: "unauthenticated" }, 401);

  const collection = c.req.query("collection");
  if (!collection) return c.json({ ok: false, error: "missing_collection" }, 400);
  const filename = c.req.query("filename") ?? null;

  const rows = await listGrants(getPool(), appId, caller.userId, collection, filename);
  return c.json({
    ok: true,
    grants: rows.map((g) => ({
      granteeUserId: g.grantee_user_id,
      granteeEmail:  g.grantee_email,
      granteeName:   g.grantee_name,
      collection:    g.collection,
      filename:      g.filename,
      role:          g.role,
      createdAt:     g.created_at,
    })),
  });
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

function toResponse(
  row: Awaited<ReturnType<typeof getFile>>,
  role?: GrantRole | "owner" | "public",
) {
  if (!row) return null;
  return {
    id:         row.id,
    ownerId:    row.owner_id,
    collection: row.collection,
    filename:   row.filename,
    mimeType:   row.mime_type,
    sizeBytes:  row.size_bytes,
    isPublic:   row.is_public,
    createdAt:  row.created_at,
    ...(role ? { role } : {}),
  };
}
