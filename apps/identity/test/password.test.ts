import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password.js";

describe("password hashing", () => {
  it("hashes and verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toBe("correct horse battery staple");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("s3cret");
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("returns false on a malformed hash instead of throwing", async () => {
    expect(await verifyPassword("not-a-valid-argon2-hash", "x")).toBe(false);
  });
});
