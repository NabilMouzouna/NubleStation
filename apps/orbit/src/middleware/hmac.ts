import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import {
  HMAC_MAX_SKEW_MS,
  X_NUBLE_APP_ID,
  X_NUBLE_APP_SLUG,
  X_NUBLE_ORG_DOMAIN,
  X_NUBLE_SIG,
  X_NUBLE_TIMESTAMP,
  X_NUBLE_USER_ID,
  computeHmac,
  sha256Hex,
  verifyHmac,
} from "@nublestation/shared";
import { loadConfig } from "../config.js";
import type { HonoVariables } from "../types.js";

const uuidSchema   = z.string().uuid();
const slugSchema   = z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
const domainSchema = z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);

export const hmacAuth: MiddlewareHandler<{ Variables: HonoVariables }> = async (
  c,
  next,
) => {
  const cfg = loadConfig();
  const log = c.var.log;

  const appId     = c.req.header(X_NUBLE_APP_ID);
  const userId    = c.req.header(X_NUBLE_USER_ID);
  const timestamp = c.req.header(X_NUBLE_TIMESTAMP);
  const sig       = c.req.header(X_NUBLE_SIG);
  const appSlug   = c.req.header(X_NUBLE_APP_SLUG);
  const orgDomain = c.req.header(X_NUBLE_ORG_DOMAIN);

  if (!appId || !userId || !timestamp || !sig || !appSlug || !orgDomain) {
    log.warn({ reason: "missing_signature_headers" }, "hmac auth rejected");
    return c.json({ ok: false, error: "missing_signature_headers" }, 401);
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > HMAC_MAX_SKEW_MS) {
    log.warn({ reason: "stale_timestamp", skewMs: Date.now() - ts, appId }, "hmac auth rejected");
    return c.json({ ok: false, error: "stale_or_invalid_timestamp" }, 401);
  }

  if (!uuidSchema.safeParse(appId).success) {
    log.warn({ reason: "invalid_app_id", appId }, "hmac auth rejected");
    return c.json({ ok: false, error: "invalid_app_id" }, 400);
  }

  if (!slugSchema.safeParse(appSlug).success) {
    log.warn({ reason: "invalid_app_slug", appSlug }, "hmac auth rejected");
    return c.json({ ok: false, error: "invalid_app_slug" }, 400);
  }

  if (!domainSchema.safeParse(orgDomain).success) {
    log.warn({ reason: "invalid_org_domain", orgDomain }, "hmac auth rejected");
    return c.json({ ok: false, error: "invalid_org_domain" }, 400);
  }

  const bodyBytes = new Uint8Array(await c.req.raw.clone().arrayBuffer());
  const bodyHash  = sha256Hex(bodyBytes);
  const context: Record<string, string> = {
    [X_NUBLE_APP_ID]:     appId,
    [X_NUBLE_APP_SLUG]:   appSlug,
    [X_NUBLE_ORG_DOMAIN]: orgDomain,
    [X_NUBLE_USER_ID]:    userId,
  };
  const expected  = computeHmac(
    c.req.method,
    c.req.path,
    bodyHash,
    timestamp,
    cfg.INTERNAL_HMAC_SECRET,
    context,
  );

  if (!verifyHmac(expected, sig)) {
    log.warn({ reason: "bad_signature", appId, appSlug }, "hmac auth rejected");
    return c.json({ ok: false, error: "bad_signature" }, 401);
  }

  c.set("appId", appId);
  c.set("userId", userId);
  c.set("appSlug", appSlug);
  c.set("orgDomain", orgDomain);
  await next();
};
