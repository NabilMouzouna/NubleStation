import { describe, expect, it } from "vitest";
import { decideRole } from "../src/services/access.js";
import { isAllowedRedirect } from "../src/util/redirect.js";

describe("decideRole (implicit admin rule)", () => {
  it("super_admin is admin on every app with no grant", () => {
    expect(decideRole("super_admin", null)).toBe("admin");
  });
  it("admin is admin on every app with no grant", () => {
    expect(decideRole("admin", null)).toBe("admin");
  });
  it("end_user with no grant is denied (null)", () => {
    expect(decideRole("end_user", null)).toBeNull();
  });
  it("end_user gets their explicit grant", () => {
    expect(decideRole("end_user", "editor")).toBe("editor");
  });
});

describe("isAllowedRedirect (open-redirect prevention)", () => {
  const org = "nuble";
  it("allows the org root", () => {
    expect(isAllowedRedirect("http://nuble.local/", org)).toBe(true);
  });
  it("allows app subdomains", () => {
    expect(isAllowedRedirect("http://tasks.nuble.local/callback", org)).toBe(true);
    expect(isAllowedRedirect("https://bucket.nuble.local/", org)).toBe(true);
  });
  it("rejects external hosts", () => {
    expect(isAllowedRedirect("http://evil.com/", org)).toBe(false);
  });
  it("rejects look-alike suffix hosts", () => {
    expect(isAllowedRedirect("http://nuble.local.evil.com/", org)).toBe(false);
  });
  it("rejects non-http(s) schemes", () => {
    expect(isAllowedRedirect("javascript:alert(1)", org)).toBe(false);
    expect(isAllowedRedirect("ftp://nuble.local/", org)).toBe(false);
  });
  it("rejects malformed URLs", () => {
    expect(isAllowedRedirect("not a url", org)).toBe(false);
  });
});
