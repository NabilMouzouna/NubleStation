import { afterEach, describe, expect, it, vi } from "vitest";
import { IdentityError, createIdentityClient } from "../src/index.js";

const CONFIG = {
  url: "http://api.test.local",
  identityUrl: "http://identity.test.local",
  app: "bucket",
};
const client = createIdentityClient(CONFIG);

const USER = {
  id: "u-1",
  email: "nurse@clinic.test",
  displayName: "Ada Nurse",
  avatarUrl: null,
  role: "editor" as string | null,
};

function jsonRes(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Routes fetch by URL: `me` (no app), `meApp` (?app=), `logout`. */
function routeFetch(handlers: {
  me?: () => Response;
  meApp?: () => Response;
  logout?: () => Response;
}) {
  const fn = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/v1/auth/logout")) return Promise.resolve(handlers.logout?.() ?? jsonRes(200, { ok: true }));
    if (url.includes("/v1/auth/me?app=")) return Promise.resolve(handlers.meApp!());
    if (url.includes("/v1/auth/me")) return Promise.resolve(handlers.me!());
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// getUser
// ---------------------------------------------------------------------------

describe("getUser", () => {
  it("returns the user on 200 (no app context)", async () => {
    routeFetch({ me: () => jsonRes(200, { ok: true, user: { ...USER, role: null } }) });
    const u = await client.getUser();
    expect(u).toMatchObject({ id: "u-1", email: "nurse@clinic.test" });
  });

  it("returns null when signed out (401)", async () => {
    routeFetch({ me: () => jsonRes(401, { ok: false, error: "unauthenticated" }) });
    expect(await client.getUser()).toBeNull();
  });

  it("sends credentials: include to forward the session cookie", async () => {
    const fn = routeFetch({ me: () => jsonRes(401, { ok: false }) });
    await client.getUser();
    const [, init] = fn.mock.calls[0]!;
    expect((init as RequestInit).credentials).toBe("include");
  });

  it("throws IdentityError on an unexpected status", async () => {
    routeFetch({ me: () => jsonRes(500, { error: "boom" }) });
    await expect(client.getUser()).rejects.toMatchObject({ status: 500, code: "boom" });
  });
});

// ---------------------------------------------------------------------------
// getSession
// ---------------------------------------------------------------------------

describe("getSession", () => {
  it("authenticated when the app check returns a user with a role", async () => {
    routeFetch({ meApp: () => jsonRes(200, { ok: true, user: USER }) });
    expect(await client.getSession()).toEqual({ status: "authenticated", user: USER });
  });

  it("unauthenticated on 401", async () => {
    routeFetch({ meApp: () => jsonRes(401, { ok: false }) });
    expect(await client.getSession()).toEqual({ status: "unauthenticated" });
  });

  it("forbidden on 403, resolving the bare identity for the user object", async () => {
    routeFetch({
      meApp: () => jsonRes(403, { ok: false, error: "forbidden" }),
      me: () => jsonRes(200, { ok: true, user: { ...USER, role: null } }),
    });
    const s = await client.getSession();
    expect(s.status).toBe("forbidden");
    expect(s.status === "forbidden" && s.user.id).toBe("u-1");
  });

  it("targets /v1/auth/me?app=<slug>", async () => {
    const fn = routeFetch({ meApp: () => jsonRes(200, { ok: true, user: USER }) });
    await client.getSession();
    expect(String(fn.mock.calls[0]![0])).toBe("http://api.test.local/v1/auth/me?app=bucket");
  });
});

// ---------------------------------------------------------------------------
// isAuthenticated / hasAccess
// ---------------------------------------------------------------------------

describe("isAuthenticated", () => {
  it("true when a session exists", async () => {
    routeFetch({ me: () => jsonRes(200, { ok: true, user: USER }) });
    expect(await client.isAuthenticated()).toBe(true);
  });
  it("false when signed out", async () => {
    routeFetch({ me: () => jsonRes(401, { ok: false }) });
    expect(await client.isAuthenticated()).toBe(false);
  });
});

describe("hasAccess", () => {
  it("true when authenticated with any role", async () => {
    routeFetch({ meApp: () => jsonRes(200, { ok: true, user: USER }) });
    expect(await client.hasAccess()).toBe(true);
  });

  it("true only for the matching role when one is required", async () => {
    routeFetch({ meApp: () => jsonRes(200, { ok: true, user: { ...USER, role: "editor" } }) });
    expect(await client.hasAccess("editor")).toBe(true);
    routeFetch({ meApp: () => jsonRes(200, { ok: true, user: { ...USER, role: "viewer" } }) });
    expect(await client.hasAccess("admin")).toBe(false);
  });

  it("false when forbidden", async () => {
    routeFetch({
      meApp: () => jsonRes(403, { ok: false, error: "forbidden" }),
      me: () => jsonRes(200, { ok: true, user: { ...USER, role: null } }),
    });
    expect(await client.hasAccess()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// requireUser
// ---------------------------------------------------------------------------

describe("requireUser", () => {
  it("resolves with the user when authenticated", async () => {
    routeFetch({ meApp: () => jsonRes(200, { ok: true, user: USER }) });
    await expect(client.requireUser()).resolves.toMatchObject({ id: "u-1" });
  });

  it("throws IdentityError(403) when forbidden and no handler given", async () => {
    routeFetch({
      meApp: () => jsonRes(403, { ok: false, error: "forbidden" }),
      me: () => jsonRes(200, { ok: true, user: { ...USER, role: null } }),
    });
    await expect(client.requireUser()).rejects.toBeInstanceOf(IdentityError);
  });

  it("calls onForbidden instead of throwing when provided", async () => {
    routeFetch({
      meApp: () => jsonRes(403, { ok: false, error: "forbidden" }),
      me: () => jsonRes(200, { ok: true, user: { ...USER, role: null } }),
    });
    const onForbidden = vi.fn();
    // The returned promise never settles by design; assert the side effect.
    void client.requireUser({ onForbidden });
    await vi.waitFor(() => expect(onForbidden).toHaveBeenCalledWith(expect.objectContaining({ id: "u-1" })));
  });
});

// ---------------------------------------------------------------------------
// loginUrl / logout
// ---------------------------------------------------------------------------

describe("loginUrl", () => {
  it("builds the authorize URL with app and redirect_uri", () => {
    const url = client.loginUrl("http://bucket.test.local/files");
    expect(url).toBe(
      "http://identity.test.local/authorize?app=bucket&redirect_uri=" +
        encodeURIComponent("http://bucket.test.local/files"),
    );
  });
});

describe("logout", () => {
  it("POSTs to /v1/auth/logout with credentials", async () => {
    const fn = routeFetch({ logout: () => jsonRes(200, { ok: true }) });
    await client.logout("http://identity.test.local/login");
    const [url, init] = fn.mock.calls[0]!;
    expect(String(url)).toBe("http://api.test.local/v1/auth/logout");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).credentials).toBe("include");
  });
});

// ---------------------------------------------------------------------------
// IdentityError
// ---------------------------------------------------------------------------

describe("IdentityError", () => {
  it("is an Error exposing status and code", () => {
    const e = new IdentityError(403, "forbidden");
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(403);
    expect(e.code).toBe("forbidden");
    expect(e.name).toBe("IdentityError");
  });
});
