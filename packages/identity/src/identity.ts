import { IdentityError } from "./errors.js";
import type {
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
async function fetchMe(config: IdentityConfig, app?: string): Promise<{ status: number; body: MeResponse }> {
  const qs = app ? `?app=${encodeURIComponent(app)}` : "";
  const res = await fetch(`${config.url}/v1/auth/me${qs}`, {
    method: "GET",
    credentials: "include", // send the .{org}.local session cookie cross-subdomain
    headers: { accept: "application/json" },
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
  const client = {
    // ── Reading the user ────────────────────────────────────────────────────

    /**
     * The currently signed-in user, regardless of app access. `role` is `null`
     * here (no app context). Returns `null` when there is no valid session.
     * Use this for "who is logged in" UI on pages that don't gate on access.
     */
    async getUser(): Promise<IdentityUser | null> {
      const { status, body } = await fetchMe(config);
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
      const { status, body } = await fetchMe(config, config.app);
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
