import { hash, verify } from "@node-rs/argon2";

/** Argon2id hash of a plaintext password. */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/** Constant-time verify of a plaintext password against a stored Argon2 hash. */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}
