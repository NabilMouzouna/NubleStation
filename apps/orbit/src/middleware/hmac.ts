import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import {
  HMAC_MAX_SKEW_MS,
  X_NUBLE_APP_ID,
  X_NUBLE_APP_SLUG,
  X_NUBLE_SIG,
  X_NUBLE_TIMESTAMP,
  X_NUBLE_USER_ID,
  computeHmac,
  sha256Hex,
  verifyHmac,
} from "@nublestation/shared";
import { loadConfig } from "../config.js";
import type { HonoVariables } from "../types.js";

const uuidSchema = z.string().uuid();
const slugSchema = z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);

export const hmacAuth: MiddlewareHandler<{ Variables: HonoVariables }> = async (
  c,
  next,
) => {
  const cfg = loadConfig();
  const appId = c.req.header(X_NUBLE_APP_ID);
  const userId = c.req.header(X_NUBLE_USER_ID);
  const timestamp = c.req.header(X_NUBLE_TIMESTAMP);
  const sig = c.req.header(X_NUBLE_SIG);
  const appSlug = c.req.header(X_NUBLE_APP_SLUG);

  if (!appId || !userId || !timestamp || !sig || !appSlug) {
    return c.json({ ok: false, error: "missing_signature_headers" }, 401);
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > HMAC_MAX_SKEW_MS) {
    return c.json({ ok: false, error: "stale_or_invalid_timestamp" }, 401);
  }

  if (!uuidSchema.safeParse(appId).success) {
    return c.json({ ok: false, error: "invalid_app_id" }, 400);
  }

  if (!slugSchema.safeParse(appSlug).success) {
    return c.json({ ok: false, error: "invalid_app_slug" }, 400);
  }

  const bodyBytes = new Uint8Array(await c.req.raw.clone().arrayBuffer());
  const bodyHash = sha256Hex(bodyBytes);
  const expected = computeHmac(
    c.req.method,
    c.req.path,
    bodyHash,
    timestamp,
    cfg.INTERNAL_HMAC_SECRET,
  );

  if (!verifyHmac(expected, sig)) {
    return c.json({ ok: false, error: "bad_signature" }, 401);
  }

  c.set("appId", appId);
  c.set("userId", userId);
  c.set("appSlug", appSlug);
  await next();
};
