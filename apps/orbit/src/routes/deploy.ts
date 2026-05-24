import { Writable } from "node:stream";
import busboy from "busboy";
import { Hono } from "hono";
import { loadConfig } from "../config.js";
import { getPool } from "../db/pool.js";
import { logger } from "../logger.js";
import { atomicDeploy, rollback } from "../services/storage.js";
import type { HonoVariables } from "../types.js";

export const deploy = new Hono<{ Variables: HonoVariables }>();

const MAX_BUNDLE_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Parses the multipart body for a single `bundle` field.
 * Returns the raw zip bytes, or throws if the field is missing or oversized.
 */
async function extractBundleFromMultipart(req: Request): Promise<Uint8Array> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw Object.assign(new Error("expected multipart/form-data"), {
      code: "invalid_content_type",
      status: 400,
    });
  }

  const bb = busboy({
    headers: { "content-type": contentType },
    limits: { fileSize: MAX_BUNDLE_BYTES },
  });

  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let found = false;

    bb.on("file", (fieldname, stream) => {
      if (fieldname !== "bundle") {
        stream.resume();
        return;
      }
      found = true;
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () =>
        reject(
          Object.assign(new Error("bundle_too_large"), {
            code: "bundle_too_large",
            status: 413,
          }),
        ),
      );
      stream.on("error", reject);
    });

    bb.on("finish", () => {
      if (!found) {
        return reject(
          Object.assign(new Error("missing bundle field"), {
            code: "missing_bundle_field",
            status: 400,
          }),
        );
      }
      resolve(new Uint8Array(Buffer.concat(chunks)));
    });

    bb.on("error", reject);

    req
      .arrayBuffer()
      .then((ab) => {
        const writable = new Writable({
          write(chunk, _enc, cb) {
            bb.write(chunk, cb);
          },
          final(cb) {
            bb.end();
            cb();
          },
        });
        writable.write(Buffer.from(ab));
        writable.end();
      })
      .catch(reject);
  });
}

deploy.post("/v1/orbit/deploy", async (c) => {
  const cfg = loadConfig();
  const appId = c.var.appId;
  const slug = c.var.appSlug;

  let zipBytes: Uint8Array;
  try {
    zipBytes = await extractBundleFromMultipart(c.req.raw);
  } catch (err) {
    const e = err as { code?: string; status?: number };
    logger.warn({ code: e.code, appId, slug }, "bundle upload rejected");
    return c.json({ ok: false, error: e.code ?? "upload_error" }, (e.status ?? 400) as 400);
  }

  let version: string;
  try {
    version = await atomicDeploy(cfg.STORAGE_ROOT, slug, zipBytes);
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "missing_index_html") {
      return c.json({ ok: false, error: "missing_index_html" }, 422);
    }
    logger.error({ err, appId, slug }, "atomic deploy failed");
    return c.json({ ok: false, error: "deploy_failed" }, 500);
  }

  try {
    await getPool().query(
      `INSERT INTO platform.deployments (app_id, version, file_path) VALUES ($1, $2, $3)`,
      [appId, version, `${cfg.STORAGE_ROOT}/${slug}/current`],
    );
  } catch (err) {
    logger.warn({ err, appId, slug, version }, "failed to record deployment in db");
  }

  logger.info({ appId, slug, version }, "deploy complete");
  return c.json({ ok: true, version, appSlug: slug });
});

deploy.post("/v1/orbit/rollback", async (c) => {
  const cfg = loadConfig();
  const appId = c.var.appId;
  const slug = c.var.appSlug;

  try {
    await rollback(cfg.STORAGE_ROOT, slug);
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "no_previous_version") {
      return c.json({ ok: false, error: "no_previous_version" }, 409);
    }
    logger.error({ err, appId, slug }, "rollback failed");
    return c.json({ ok: false, error: "rollback_failed" }, 500);
  }

  logger.info({ appId, slug }, "rollback complete");
  return c.json({ ok: true });
});
