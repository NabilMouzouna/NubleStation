import { describe, expect, it } from "vitest";
import { computeHmac, sha256Hex, verifyHmac } from "@nublestation/shared";
import { signRequest } from "../src/forward/sign.js";

const SECRET = "test-secret-must-be-min-16";

describe("signRequest", () => {
  it("produces a deterministic signature for fixed timestamp + body", () => {
    const body = new TextEncoder().encode('{"hello":"world"}');
    const a = signRequest("POST", "/v1/db/tasks", body, SECRET, 1_700_000_000_000);
    const b = signRequest("POST", "/v1/db/tasks", body, SECRET, 1_700_000_000_000);
    expect(a.signature).toBe(b.signature);
    expect(a.timestamp).toBe("1700000000000");
  });

  it("produces a verifiable signature", () => {
    const body = new Uint8Array();
    const { bodyHash, timestamp, signature } = signRequest(
      "GET",
      "/v1/db/_ping",
      body,
      SECRET,
    );
    const expected = computeHmac("GET", "/v1/db/_ping", bodyHash, timestamp, SECRET);
    expect(verifyHmac(expected, signature)).toBe(true);
    expect(bodyHash).toBe(sha256Hex(body));
  });

  it("changes if any input changes (tamper detection)", () => {
    const body = new TextEncoder().encode("x");
    const a = signRequest("POST", "/v1/db/x", body, SECRET, 1);
    const b = signRequest("POST", "/v1/db/x", new TextEncoder().encode("y"), SECRET, 1);
    const c = signRequest("POST", "/v1/db/y", body, SECRET, 1);
    const d = signRequest("GET", "/v1/db/x", body, SECRET, 1);
    const e = signRequest("POST", "/v1/db/x", body, SECRET, 2);
    expect(b.signature).not.toBe(a.signature);
    expect(c.signature).not.toBe(a.signature);
    expect(d.signature).not.toBe(a.signature);
    expect(e.signature).not.toBe(a.signature);
  });
});
