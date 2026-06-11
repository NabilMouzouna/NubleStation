import { IdentityError } from "./errors.js";
import type {
  AppUser,
  IdentityConfig,
  IdentityUser,
  RequireUserOptions,
  SessionState,
} from "./types.js";

interface MeResponse {
  ok: boolean;
  user?: IdentityUser;
  error?: string;
}

/** Low-level call to GET /v1/auth/me. Returns the parsed body + status without
 *  throwing for the expected auth outcomes (200/401/403); throws otherwise. */
async function fetchMe(
  config: IdentityConfig,
  app?: string,
  bearerToken?: string,
): Promise<{ status: number; body: MeResponse }> {
  const qs = app ? `?app=${encodeURIComponent(app)}` : "";
  const headers: Record<string, string> = { accept: "application/json" };
  if (bearerToken) headers["authorization"] = `Bearer ${bearerToken}`;
  const res = await fetch(`${config.url}/v1/auth/me${qs}`, {
    method: "GET",
    credentials: "include",
    headers,
  });

  if (res.status === 200 || res.status === 401 || res.status === 403) {
    return { status: res.status, body: (await res.json()) as MeResponse };
  }

  // 404 unknown_app, 5xx, etc. — a real failure the caller should know about.
  let code = "request_failed";
  try { code = ((await res.json()) as MeResponse).error ?? code; } catch { /* ignore */ }
  throw new IdentityError(res.status, code);
}

function navigate(url: string): void {
  if (typeof window !== "undefined") window.location.assign(url);
}

/**
 * Creates a NubleStation Identity client for a browser app.
 *
 * Auth is cookie-based SSO: the session cookie is scoped to the parent domain
 * (`.{org}.local`), so it is sent automatically on cross-subdomain requests
 * (`credentials: "include"`). There are no browser-side tokens.
 *
 * @example
 * ```typescript
 * import { createIdentityClient } from "@nublestation/identity";
 *
 * const auth = createIdentityClient({
 *   url:         "http://api.clinic.local",
 *   identityUrl: "http://identity.clinic.local",
 *   app:         "bucket",
 * });
 *
 * const session = await auth.getSession();
 * if (session.status === "unauthenticated") auth.login();
 * ```
 */
export function createIdentityClient(config: IdentityConfig) {
  // ── Bearer-token fallback for mobile Safari ────────────────────────────────
  // Safari on iOS does not send SameSite=Lax cookies in cross-subdomain fetches
  // when the TLD (.local) is absent from the Public Suffix List. Identity's
  // /authorize redirect appends a one-time `nuble_token` query param; we drain
  // it here, store it in sessionStorage, and send it as Authorization: Bearer
  // on every API call so the cookie path and the header path both work.
  const TOKEN_KEY = `__nuble_token_${config.app}`;

  function drainUrlToken(): void {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("nuble_token");
    if (!token) return;
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
    params.delete("nuble_token");
    const q = params.toString();
    window.history.replaceState(
      null, "",
      window.location.pathname + (q ? `?${q}` : "") + window.location.hash,
    );
  }

  function getBearer(): string | undefined {
    try { return sessionStorage.getItem(TOKEN_KEY) ?? undefined; } catch { return undefined; }
  }

  function clearBearer(): void {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  }

  // Drain on creation (module-level singleton means this runs once on import).
  drainUrlToken();

  const client = {
    // ── Reading the user ────────────────────────────────────────────────────

    /**
     * The currently signed-in user, regardless of app access. `role` is `null`
     * here (no app context). Returns `null` when there is no valid session.
     * Use this for "who is logged in" UI on pages that don't gate on access.
     */
    async getUser(): Promise<IdentityUser | null> {
      const { status, body } = await fetchMe(config, undefined, getBearer());
      if (status === 200 && body.user) return body.user;
      return null; // 401
    },

    /**
     * Full session state for the configured app: `authenticated` (has a role),
     * `forbidden` (signed in, no access — default-deny), or `unauthenticated`.
     * One network call in the happy path; a second only to resolve the user
     * object for the `forbidden` case (the 403 body carries no user).
     */
    async getSession(): Promise<SessionState> {
      const bearer = getBearer();
      const { status, body } = await fetchMe(config, config.app, bearer);
      if (status === 200 && body.user) return { status: "authenticated", user: body.user };
      if (status === 401) return { status: "unauthenticated" };
      // 403 forbidden — fetch the bare identity so callers can greet the user.
      const user = await client.getUser();
      return user ? { status: "forbidden", user } : { status: "unauthenticated" };
    },

    // ── Verifying auth (route protection) ───────────────────────────────────

    /** `true` if a valid session exists (ignores per-app access). */
    async isAuthenticated(): Promise<boolean> {
      return (await client.getUser()) !== null;
    },

    /**
     * `true` if the user is signed in and has access to this app. Pass `role`
     * to also require a specific role (e.g. `hasAccess("admin")`).
     */
    async hasAccess(role?: string): Promise<boolean> {
      const session = await client.getSession();
      if (session.status !== "authenticated") return false;
      return role ? session.user.role === role : true;
    },

    /**
     * Route guard. Resolves with the user when signed in *and* allowed on this
     * app. Otherwise redirects the browser to the SSO sign-in (returning here
     * afterwards). On `forbidden` it calls `onForbidden` if provided, else
     * throws `IdentityError(403, "forbidden")`.
     */
    async requireUser(opts: RequireUserOptions = {}): Promise<IdentityUser> {
      const session = await client.getSession();
      if (session.status === "authenticated") return session.user;
      if (session.status === "forbidden") {
        if (opts.onForbidden) {
          opts.onForbidden(session.user);
          // Resolve to a never-settling promise so guarded code doesn't run.
          return new Promise<IdentityUser>(() => {});
        }
        throw new IdentityError(403, "forbidden");
      }
      client.login(opts.redirectUri);
      return new Promise<IdentityUser>(() => {}); // navigation in flight
    },

    // ── Sharing helpers ─────────────────────────────────────────────────────

    /**
     * Users you can share with in this app (ADR 016) — everyone with access to
     * the app, minus yourself. Requires a session with access; throws
     * `IdentityError` otherwise. Feeds a "share with" picker.
     */
    async listAppUsers(): Promise<AppUser[]> {
      const bearer = getBearer();
      const headers: Record<string, string> = { accept: "application/json" };
      if (bearer) headers["authorization"] = `Bearer ${bearer}`;
      const res = await fetch(
        `${config.url}/v1/auth/app-users?app=${encodeURIComponent(config.app)}`,
        { method: "GET", credentials: "include", headers },
      );
      if (!res.ok) {
        let code = "request_failed";
        try { code = ((await res.json()) as { error?: string }).error ?? code; } catch { /* ignore */ }
        throw new IdentityError(res.status, code);
      }
      return ((await res.json()) as { users: AppUser[] }).users;
    },

    // ── Sign-in / sign-out ──────────────────────────────────────────────────

    /** The SSO sign-in URL for this app (use as a button href). */
    loginUrl(redirectUri?: string): string {
      const back =
        redirectUri ?? (typeof window !== "undefined" ? window.location.href : config.identityUrl);
      return (
        `${config.identityUrl}/authorize` +
        `?app=${encodeURIComponent(config.app)}` +
        `&redirect_uri=${encodeURIComponent(back)}`
      );
    },

    /** Navigate to the SSO sign-in for this app. */
    login(redirectUri?: string): void {
      navigate(client.loginUrl(redirectUri));
    },

    /**
     * Revoke the current session server-side, then navigate to `redirectTo`
     * (defaults to the Identity sign-in page).
     */
    async logout(redirectTo?: string): Promise<void> {
      clearBearer();
      try {
        await fetch(`${config.url}/v1/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
      } finally {
        navigate(redirectTo ?? `${config.identityUrl}/login`);
      }
    },
  };

  return client;
}

export type IdentityClient = ReturnType<typeof createIdentityClient>;
