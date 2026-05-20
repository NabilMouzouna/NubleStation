import { Hono } from "hono";
import { resolveApiKey } from "../auth/api-key.js";
import { loadConfig } from "../config.js";
import { forwardSigned } from "../forward/proxy.js";
import { logger } from "../logger.js";

export const proxy = new Hono();

proxy.all("/v1/*", async (c) => {
  const cfg = loadConfig();
  const resolved = await resolveApiKey(c.req.header("authorization"));
  if (!resolved) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }

  // Phase 1 placeholder: real user_id comes from the auth service in a later phase.
  // ADR 003 §14 names X-Nuble-User-Id, but session resolution is auth-service territory.
  const userId = resolved.apiKeyId;

  const body = new Uint8Array(await c.req.raw.arrayBuffer());
  const contentType = c.req.header("content-type") ?? null;

  try {
    const upstream = await forwardSigned({
      dbBaseUrl: cfg.DB_INTERNAL_URL,
      method: c.req.method,
      path: c.req.path,
      body,
      appId: resolved.appId,
      userId,
      hmacSecret: cfg.INTERNAL_HMAC_SECRET,
      contentType,
    });

    // `new Response()` expects BodyInit; cast the Uint8Array to ArrayBuffer
    // (we own the buffer slice) to satisfy the DOM lib types.
    const respBody = upstream.body.buffer.slice(
      upstream.body.byteOffset,
      upstream.body.byteOffset + upstream.body.byteLength,
    ) as ArrayBuffer;
    return new Response(respBody, {
      status: upstream.status,
      headers: Object.fromEntries(
        Object.entries(upstream.headers).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.join(", ") : v,
        ]),
      ),
    });
  } catch (err) {
    logger.error({ err, path: c.req.path }, "forward failed");
    return c.json({ ok: false, error: "upstream_unavailable" }, 502);
  }
});
