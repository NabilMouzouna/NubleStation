import { Hono } from "hono";
import { resolveApiKey } from "../auth/api-key.js";
import { resolveSessionUser } from "../auth/session.js";
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
): { baseUrl: string; needsSlug: boolean; userScoped: boolean } | null {
  const segment = path.split("/")[2]; // /v1/{segment}/...
  switch (segment) {
    case "orbit":
      return { baseUrl: cfg.ORBIT_INTERNAL_URL, needsSlug: true, userScoped: false };
    case "vault":
      // ADR 016: Vault is user-aware — the session cookie identifies the human
      // who owns/accesses a file, on top of the app-scoping API key.
      return { baseUrl: cfg.VAULT_INTERNAL_URL, needsSlug: false, userScoped: true };
    case "blaze":
    case "db": // legacy prefix — kept for compatibility
      return { baseUrl: cfg.DB_INTERNAL_URL, needsSlug: false, userScoped: false };
    default:
      return null;
  }
}

// Public file serving — no API key, no HMAC. Vault checks is_public internally.
proxy.get("/vault/*", async (c) => {
  const cfg = loadConfig();
  try {
    const resp = await fetch(`${cfg.VAULT_INTERNAL_URL}${c.req.path}`);
    const body = await resp.arrayBuffer();
    return new Response(body, {
      status: resp.status,
      headers: {
        "content-type":   resp.headers.get("content-type") ?? "application/octet-stream",
        "content-length": resp.headers.get("content-length") ?? String(body.byteLength),
        "cache-control":  resp.headers.get("cache-control") ?? "no-store",
      },
    });
  } catch (err) {
    logger.error({ err, path: c.req.path }, "vault public forward failed");
    return c.json({ ok: false, error: "upstream_unavailable" }, 502);
  }
});

// Identity auth endpoints are cookie-based, not API-key-based. The gateway
// forwards them to Identity verbatim — passing the Cookie header through and
// relaying Set-Cookie back — without resolving an API key. Registered before
// the generic /v1/* handler so it wins. (ADR 014)
proxy.all("/v1/auth/*", async (c) => {
  const cfg = loadConfig();
  const u = new URL(c.req.url);
  const target = `${cfg.IDENTITY_INTERNAL_URL}${u.pathname}${u.search}`;

  const headers: Record<string, string> = {};
  const cookie = c.req.header("cookie");
  if (cookie) headers.cookie = cookie;
  const authorization = c.req.header("authorization");
  if (authorization) headers.authorization = authorization;
  const contentType = c.req.header("content-type");
  if (contentType) headers["content-type"] = contentType;

  const method = c.req.method;
  const body =
    method === "GET" || method === "HEAD" ? undefined : await c.req.raw.arrayBuffer();

  try {
    const resp = await fetch(target, { method, headers, body });
    const respBody = await resp.arrayBuffer();
    const out = new Headers();
    const ct = resp.headers.get("content-type");
    if (ct) out.set("content-type", ct);
    for (const sc of resp.headers.getSetCookie()) out.append("set-cookie", sc);
    return new Response(respBody, { status: resp.status, headers: out });
  } catch (err) {
    logger.error({ err, path: c.req.path }, "identity forward failed");
    return c.json({ ok: false, error: "upstream_unavailable" }, 502);
  }
});

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

  // For user-scoped services (Vault, ADR 016) the session cookie identifies the
  // human. We inject the real Identity user_id when a valid cookie is present;
  // otherwise the call is anonymous (apiKeyId) and only public reads succeed.
  let userId = resolved.apiKeyId;
  if (upstream.userScoped) {
    const sessionUser = await resolveSessionUser(c.req.header("cookie"));
    if (sessionUser) userId = sessionUser;
  }

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
