import { access, constants, mkdir } from "node:fs/promises";
import { Hono } from "hono";
import { loadConfig } from "../config.js";
import { logger } from "../logger.js";

export const health = new Hono();

health.get("/healthz", (c) => c.json({ ok: true }));

health.get("/readyz", async (c) => {
  const cfg = loadConfig();
  try {
    await mkdir(cfg.STORAGE_ROOT, { recursive: true });
    await access(cfg.STORAGE_ROOT, constants.W_OK);
  } catch (e) {
    logger.error({ err: e, storageRoot: cfg.STORAGE_ROOT }, "readyz: storage check failed");
    return c.json({ ok: false, reason: "storage_unwritable" }, 503);
  }
  return c.json({ ok: true });
});
