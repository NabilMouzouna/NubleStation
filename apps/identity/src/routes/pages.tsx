/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { Hono } from "hono";
import type { Context } from "hono";
import { loadConfig } from "../config.js";
import { verifyPassword } from "../auth/password.js";
import {
  createSession,
  deleteSession,
  resolveSession,
  setSessionCookie,
  clearSessionCookie,
  getSessionToken,
} from "../auth/session.js";
import { getUserAppRole, resolveAppIdBySlug } from "../services/access.js";
import {
  EmailExistsError,
  changePassword,
  findByEmail,
  getProfile,
  listUserApps,
  registerUser,
  updateAvatarUrl,
  updateProfile,
} from "../services/users.js";
import { uploadAvatar } from "../services/vault.js";
import { isAllowedRedirect } from "../util/redirect.js";
import { LoginPage, MessagePage, ProfilePage, RegisterPage } from "../views.js";
import type { HonoVariables } from "../types.js";

export const pages = new Hono<{ Variables: HonoVariables }>();

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function opt(v: unknown): string | undefined {
  const s = str(v).trim();
  return s.length ? s : undefined;
}
/** Where to go after a successful login/register: continue an authorize flow if
 *  one was in progress, otherwise the account page. */
function continueUrl(app?: string, redirectUri?: string): string {
  if (app && redirectUri) {
    return `/authorize?app=${encodeURIComponent(app)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }
  return "/account";
}

// ── Root ─────────────────────────────────────────────────────────────────────
// Landing for identity.{org}.local — send signed-in users to their profile and
// everyone else to the sign-in page (which links to "Create an account").
pages.get("/", (c) => c.redirect("/account"));

// ── Login ────────────────────────────────────────────────────────────────────

pages.get("/login", (c) =>
  c.html(<LoginPage app={c.req.query("app")} redirectUri={c.req.query("redirect_uri")} />),
);

pages.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = str(body.email).trim().toLowerCase();
  const password = str(body.password);
  const app = opt(body.app);
  const redirectUri = opt(body.redirect_uri);

  const user = await findByEmail(email);
  const ok = user && user.isActive && (await verifyPassword(user.passwordHash, password));
  if (!user || !ok) {
    return c.html(
      <LoginPage app={app} redirectUri={redirectUri} error="Invalid email or password." />,
      401,
    );
  }

  // Fresh login mints a new session token and overwrites the cookie, so any
  // pre-set (fixated) token is never elevated to an authenticated session.
  const { token, expiresAt } = await createSession(user.id);
  setSessionCookie(c, token, expiresAt);
  return c.redirect(continueUrl(app, redirectUri));
});

// ── Register ───────────────────────────────────────────────────────────────

pages.get("/register", (c) =>
  c.html(<RegisterPage app={c.req.query("app")} redirectUri={c.req.query("redirect_uri")} />),
);

pages.post("/register", async (c) => {
  const log = c.var.log;
  const body = await c.req.parseBody();
  const email = str(body.email).trim().toLowerCase();
  const password = str(body.password);
  const displayName = opt(body.display_name) ?? null;
  const app = opt(body.app);
  const redirectUri = opt(body.redirect_uri);

  const fail = (error: string, status: 400 | 409 = 400) =>
    c.html(<RegisterPage app={app} redirectUri={redirectUri} error={error} />, status);

  if (!EMAIL_RE.test(email)) return fail("Enter a valid email address.");
  if (password.length < 8) return fail("Password must be at least 8 characters.");

  let userId: string;
  try {
    ({ id: userId } = await registerUser({ email, password, displayName }));
  } catch (e) {
    if (e instanceof EmailExistsError) return fail("An account with this email already exists.", 409);
    throw e;
  }

  // Avatar is best-effort: a Vault hiccup must not fail account creation.
  const avatar = body.avatar;
  if (avatar && typeof avatar !== "string" && avatar.size > 0) {
    try {
      const bytes = new Uint8Array(await avatar.arrayBuffer());
      const url = await uploadAvatar(userId, bytes, avatar.type || "image/jpeg");
      await updateAvatarUrl(userId, url);
    } catch (err) {
      log?.warn({ err, userId }, "avatar upload failed; continuing without one");
    }
  }

  const { token, expiresAt } = await createSession(userId);
  setSessionCookie(c, token, expiresAt);
  return c.redirect(continueUrl(app, redirectUri));
});

// ── Logout (form) ─────────────────────────────────────────────────────────

pages.post("/logout", async (c) => {
  await deleteSession(getSessionToken(c));
  clearSessionCookie(c);
  return c.redirect("/login");
});

// ── Authorize (the SSO grant flow / "login button" target) ──────────────────

pages.get("/authorize", async (c) => {
  const cfg = loadConfig();
  const app = c.req.query("app");
  const redirectUri = c.req.query("redirect_uri");

  if (!app || !redirectUri) {
    return c.html(
      <MessagePage title="Invalid request" icon="⚠️" heading="Invalid request"
        body="Missing app or redirect_uri." />,
      400,
    );
  }
  if (!isAllowedRedirect(redirectUri, cfg.ORG_DOMAIN)) {
    return c.html(
      <MessagePage title="Invalid redirect" icon="⛔" heading="Invalid redirect"
        body={`Redirects are only allowed within ${cfg.ORG_DOMAIN}.local.`} />,
      400,
    );
  }

  const userId = await resolveSession(getSessionToken(c));
  if (!userId) {
    // Not signed in → show login; the form carries app + redirect_uri so the
    // flow resumes here after authentication.
    return c.html(<LoginPage app={app} redirectUri={redirectUri} />);
  }

  const appId = await resolveAppIdBySlug(app);
  if (!appId) {
    return c.html(
      <MessagePage title="Unknown app" icon="❓" heading="Unknown app"
        body={`No app named "${app}" exists on this network.`} />,
      404,
    );
  }

  const role = await getUserAppRole(userId, appId);
  if (!role) {
    return c.html(
      <MessagePage title="No access" icon="🔒" heading={`No access to ${app}`}
        body="Your account doesn't have access to this app yet. Ask an admin to grant you a role." />,
      403,
    );
  }

  // Append the session token as a one-time URL param so apps on mobile browsers
  // (Safari/iOS) can use it as a Bearer token. Safari does not send SameSite=Lax
  // cookies in cross-subdomain fetches when the TLD isn't in the Public Suffix
  // List (e.g. .local), so the cookie alone is unreliable cross-subdomain.
  const rawToken = getSessionToken(c);
  const sep = redirectUri.includes("?") ? "&" : "?";
  return c.redirect(rawToken ? `${redirectUri}${sep}nuble_token=${encodeURIComponent(rawToken)}` : redirectUri);
});

// ── Account / profile (default post-login landing) ──────────────────────────

const ADMIN_ROLES = new Set(["super_admin", "admin"]);

/** Renders the profile card; `editError` re-opens the edit modal with a message. */
async function renderProfile(c: Context<{ Variables: HonoVariables }>, userId: string, editError?: string) {
  const profile = await getProfile(userId);
  if (!profile) {
    clearSessionCookie(c);
    return c.redirect("/login");
  }
  const isAdmin = ADMIN_ROLES.has(profile.role);
  const apps = isAdmin ? [] : await listUserApps(userId);
  return c.html(
    <ProfilePage
      email={profile.email}
      displayName={profile.displayName}
      avatarUrl={profile.avatarUrl}
      role={profile.role}
      createdAt={profile.createdAt}
      apps={apps}
      isAdmin={isAdmin}
      editError={editError}
    />,
  );
}

pages.get("/account", async (c) => {
  const userId = await resolveSession(getSessionToken(c));
  if (!userId) return c.redirect("/login");
  return renderProfile(c, userId);
});

pages.post("/account", async (c) => {
  const log = c.var.log;
  const userId = await resolveSession(getSessionToken(c));
  if (!userId) return c.redirect("/login");

  const body = await c.req.parseBody();
  const email = str(body.email).trim().toLowerCase();
  const displayName = opt(body.display_name) ?? null;
  const currentPw = str(body.current_password);
  const newPw = str(body.new_password);

  if (!EMAIL_RE.test(email)) return renderProfile(c, userId, "Enter a valid email address.");

  // Optional password change — only when a new password is supplied.
  if (newPw) {
    if (newPw.length < 8) return renderProfile(c, userId, "New password must be at least 8 characters.");
    const ok = await changePassword(userId, currentPw, newPw);
    if (!ok) return renderProfile(c, userId, "Current password is incorrect.");
  }

  try {
    await updateProfile(userId, { displayName, email });
  } catch (e) {
    if (e instanceof EmailExistsError) return renderProfile(c, userId, "That email is already in use.");
    throw e;
  }

  // Avatar is best-effort — a Vault hiccup shouldn't fail the whole save.
  const avatar = body.avatar;
  if (avatar && typeof avatar !== "string" && avatar.size > 0) {
    try {
      const bytes = new Uint8Array(await avatar.arrayBuffer());
      const url = await uploadAvatar(userId, bytes, avatar.type || "image/jpeg");
      await updateAvatarUrl(userId, url);
    } catch (err) {
      log?.warn({ err, userId }, "avatar update failed; profile saved without it");
    }
  }

  return c.redirect("/account");
});
