import { describe, expect, it } from "vitest";
import { computeHmac, sha256Hex, verifyHmac } from "@nublestation/shared";
import { signRequest } from "../src/forward/sign.js";

const SECRET = "test-secret-must-be-min-16";

const APP_ID   = "00000000-0000-0000-0000-000000000001";
const USER_ID  = "00000000-0000-0000-0000-000000000002";
const CONTEXT  = { "x-nuble-app-id": APP_ID, "x-nuble-user-id": USER_ID };

describe("signRequest", () => {
  it("produces a deterministic signature for fixed timestamp + body", () => {
    const body = new TextEncoder().encode('{"hello":"world"}');
    const a = signRequest("POST", "/v1/blaze/tasks", body, SECRET, CONTEXT, 1_700_000_000_000);
    const b = signRequest("POST", "/v1/blaze/tasks", body, SECRET, CONTEXT, 1_700_000_000_000);
    expect(a.signature).toBe(b.signature);
    expect(a.timestamp).toBe("1700000000000");
  });

  it("produces a verifiable signature", () => {
    const body = new Uint8Array();
    const { bodyHash, timestamp, signature } = signRequest(
      "GET",
      "/v1/blaze/_ping",
      body,
      SECRET,
      CONTEXT,
    );
    const expected = computeHmac("GET", "/v1/blaze/_ping", bodyHash, timestamp, SECRET, CONTEXT);
    expect(verifyHmac(expected, signature)).toBe(true);
    expect(bodyHash).toBe(sha256Hex(body));
  });

  it("changes if any input changes (tamper detection)", () => {
    const body = new TextEncoder().encode("x");
    const a = signRequest("POST", "/v1/blaze/x", body, SECRET, CONTEXT, 1);
    const b = signRequest("POST", "/v1/blaze/x", new TextEncoder().encode("y"), SECRET, CONTEXT, 1);
    const c = signRequest("POST", "/v1/blaze/y", body, SECRET, CONTEXT, 1);
    const d = signRequest("GET",  "/v1/blaze/x", body, SECRET, CONTEXT, 1);
    const e = signRequest("POST", "/v1/blaze/x", body, SECRET, CONTEXT, 2);
    expect(b.signature).not.toBe(a.signature);
    expect(c.signature).not.toBe(a.signature);
    expect(d.signature).not.toBe(a.signature);
    expect(e.signature).not.toBe(a.signature);
  });

  it("changes if context changes (identity tamper detection)", () => {
    const body = new TextEncoder().encode("x");
    const altCtx = { "x-nuble-app-id": "ffffffff-ffff-ffff-ffff-ffffffffffff", "x-nuble-user-id": USER_ID };
    const a = signRequest("POST", "/v1/blaze/x", body, SECRET, CONTEXT, 1);
    const b = signRequest("POST", "/v1/blaze/x", body, SECRET, altCtx,   1);
    expect(b.signature).not.toBe(a.signature);
  });
});
