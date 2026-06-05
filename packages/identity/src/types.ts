export interface IdentityConfig {
  /** Base URL of your NubleStation gateway, e.g. http://api.clinic.local */
  url: string;
  /** Base URL of the Identity pages, e.g. http://identity.clinic.local */
  identityUrl: string;
  /** This app's slug (as reserved in the Console), e.g. "bucket". Used for the
   *  per-app authorization check and the SSO authorize flow. */
  app: string;
}

export interface IdentityUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** The user's role on *this* app. `null` when checked outside an app context
   *  (e.g. getUser()) or for org admins who are implicitly admin everywhere. */
  role: string | null;
}

/**
 * The result of a session check for the configured app.
 * - `authenticated` — signed in and has access to this app (`user.role` is set).
 * - `forbidden`     — signed in, but no role granted on this app (default-deny).
 * - `unauthenticated` — no valid session.
 */
export type SessionState =
  | { status: "authenticated"; user: IdentityUser }
  | { status: "forbidden"; user: IdentityUser }
  | { status: "unauthenticated" };

export interface RequireUserOptions {
  /** Where to return after signing in. Defaults to the current page URL. */
  redirectUri?: string;
  /** Called instead of throwing when the user is signed in but lacks access. */
  onForbidden?: (user: IdentityUser) => void;
}
