import { Hono } from "hono";
import {
  deleteSession,
  resolveSession,
  clearSessionCookie,
  getSessionToken,
} from "../auth/session.js";
import { getUserAppRole, listAppUsers, resolveAppIdBySlug } from "../services/access.js";
import { getById } from "../services/users.js";
import type { HonoVariables } from "../types.js";

// JSON API reached programmatically via the Gateway at api.{org}.local/v1/auth/*.
// Cookie-based (no API key); the Gateway passes the Cookie header through.
export const auth = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /v1/auth/me[?app=slug]
 * Returns the current user. With ?app, also resolves their role for that app
 * (403 if they have none). Apps call this from their frontend — the session
 * cookie is sent automatically because it's scoped to the parent domain.
 */
auth.get("/v1/auth/me", async (c) => {
  const userId = await resolveSession(getSessionToken(c));
  if (!userId) return c.json({ ok: false, error: "unauthenticated" }, 401);

  const user = await getById(userId);
  if (!user) return c.json({ ok: false, error: "unauthenticated" }, 401);

  const app = c.req.query("app");
  let role: string | null = null;
  if (app) {
    const appId = await resolveAppIdBySlug(app);
    if (!appId) return c.json({ ok: false, error: "unknown_app" }, 404);
    role = await getUserAppRole(userId, appId);
    if (!role) return c.json({ ok: false, error: "forbidden" }, 403);
  }

  return c.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role,
    },
  });
});

/**
 * GET /v1/auth/app-users?app=slug
 * Lists users the caller can share with in this app (ADR 016). The caller must
 * be authenticated and have access to the app. The caller is omitted from the
 * result. Used by app frontends to populate a "share with" picker.
 */
auth.get("/v1/auth/app-users", async (c) => {
  const userId = await resolveSession(getSessionToken(c));
  if (!userId) return c.json({ ok: false, error: "unauthenticated" }, 401);

  const app = c.req.query("app");
  if (!app) return c.json({ ok: false, error: "missing_app" }, 400);

  const appId = await resolveAppIdBySlug(app);
  if (!appId) return c.json({ ok: false, error: "unknown_app" }, 404);

  const role = await getUserAppRole(userId, appId);
  if (!role) return c.json({ ok: false, error: "forbidden" }, 403);

  const users = (await listAppUsers(appId)).filter((u) => u.id !== userId);
  return c.json({ ok: true, users });
});

/** POST /v1/auth/logout — revoke the current session server-side and clear the cookie. */
auth.post("/v1/auth/logout", async (c) => {
  await deleteSession(getSessionToken(c));
  clearSessionCookie(c);
  return c.json({ ok: true });
});
