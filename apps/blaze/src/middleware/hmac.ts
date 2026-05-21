import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import {
  HMAC_MAX_SKEW_MS,
  X_NUBLE_APP_ID,
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

/**
 * Verifies that an incoming request was signed by the API Gateway using the
 * shared INTERNAL_HMAC_SECRET. On success, exposes the trusted app/user IDs
 * on the Hono context. Downstream routes MUST use `c.var.appId` rather than
 * reading the raw header, so the trust boundary cannot be bypassed by a
 * route that forgets to call this middleware.
 *
 * ADR 003 §14: signed internal headers; §8 Layer 0.
 */
export const hmacAuth: MiddlewareHandler<{ Variables: HonoVariables }> = async (
  c,
  next,
) => {
  const cfg = loadConfig();
  const appId = c.req.header(X_NUBLE_APP_ID);
  const userId = c.req.header(X_NUBLE_USER_ID);
  const timestamp = c.req.header(X_NUBLE_TIMESTAMP);
  const sig = c.req.header(X_NUBLE_SIG);

  if (!appId || !userId || !timestamp || !sig) {
    return c.json({ ok: false, error: "missing_signature_headers" }, 401);
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > HMAC_MAX_SKEW_MS) {
    return c.json({ ok: false, error: "stale_or_invalid_timestamp" }, 401);
  }

  if (!uuidSchema.safeParse(appId).success) {
    return c.json({ ok: false, error: "invalid_app_id" }, 400);
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
  await next();
};
