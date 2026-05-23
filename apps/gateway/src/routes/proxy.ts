import { Hono } from "hono";
import { resolveApiKey } from "../auth/api-key.js";
import { loadConfig, type Config } from "../config.js";
import { forwardSigned } from "../forward/proxy.js";
import { logger } from "../logger.js";

export const proxy = new Hono();

/**
 * Maps a request path to the correct internal service URL.
 * The first path segment after /v1/ is the service codename.
 * Unknown services get a 404 before any key resolution.
 */
function resolveUpstream(
  path: string,
  cfg: Config,
): { baseUrl: string; needsSlug: boolean } | null {
  const segment = path.split("/")[2]; // /v1/{segment}/...
  switch (segment) {
    case "orbit":
      return { baseUrl: cfg.ORBIT_INTERNAL_URL, needsSlug: true };
    case "blaze":
    case "db": // legacy prefix — kept for compatibility
      return { baseUrl: cfg.DB_INTERNAL_URL, needsSlug: false };
    default:
      return null;
  }
}

proxy.all("/v1/*", async (c) => {
  const cfg = loadConfig();

  const upstream = resolveUpstream(c.req.path, cfg);
  if (!upstream) {
    return c.json({ ok: false, error: "unknown_service" }, 404);
  }

  const resolved = await resolveApiKey(c.req.header("authorization"));
  if (!resolved) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }

  const userId = resolved.apiKeyId;
  const body = new Uint8Array(await c.req.raw.arrayBuffer());
  const contentType = c.req.header("content-type") ?? null;

  try {
    const result = await forwardSigned({
      upstreamBaseUrl: upstream.baseUrl,
      method: c.req.method,
      path: c.req.path,
      body,
      appId: resolved.appId,
      userId,
      hmacSecret: cfg.INTERNAL_HMAC_SECRET,
      contentType,
      appSlug: upstream.needsSlug ? resolved.appSlug : undefined,
    });

    const respBody = result.body.buffer.slice(
      result.body.byteOffset,
      result.body.byteOffset + result.body.byteLength,
    ) as ArrayBuffer;
    return new Response(respBody, {
      status: result.status,
      headers: Object.fromEntries(
        Object.entries(result.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v]),
      ),
    });
  } catch (err) {
    logger.error({ err, path: c.req.path }, "forward failed");
    return c.json({ ok: false, error: "upstream_unavailable" }, 502);
  }
});
