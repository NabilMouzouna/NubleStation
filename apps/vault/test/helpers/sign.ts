import {
  X_NUBLE_APP_ID,
  X_NUBLE_SIG,
  X_NUBLE_TIMESTAMP,
  X_NUBLE_USER_ID,
  computeHmac,
  sha256Hex,
} from "@nublestation/shared";

export const TEST_HMAC_SECRET = "test-secret-vault-min32chars!!!!!";
export const TEST_APP_ID      = "00000000-0000-0000-0000-000000000001";
export const TEST_USER_ID     = "00000000-0000-0000-0000-000000000002";
export const TEST_APP_SLUG    = "test-app";

export function makeSignedHeaders(
  method: string,
  path: string,
  body: Uint8Array,
): Record<string, string> {
  const timestamp = String(Date.now());
  const bodyHash  = sha256Hex(body);
  const context: Record<string, string> = {
    [X_NUBLE_APP_ID]:  TEST_APP_ID,
    [X_NUBLE_USER_ID]: TEST_USER_ID,
  };
  const sig = computeHmac(method, path, bodyHash, timestamp, TEST_HMAC_SECRET, context);
  return {
    [X_NUBLE_APP_ID]:    TEST_APP_ID,
    [X_NUBLE_USER_ID]:   TEST_USER_ID,
    [X_NUBLE_TIMESTAMP]: timestamp,
    [X_NUBLE_SIG]:       sig,
  };
}
