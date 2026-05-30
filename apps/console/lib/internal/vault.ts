import {
  X_NUBLE_APP_ID,
  X_NUBLE_APP_SLUG,
  X_NUBLE_SIG,
  X_NUBLE_TIMESTAMP,
  X_NUBLE_USER_ID,
  computeHmac,
  sha256Hex,
} from "@nublestation/shared";

export interface VaultCallArgs {
  method: string;
  path: string;
  body?: Uint8Array;
  contentType?: string | null;
  appId: string;
  appSlug: string;
}

/**
 * Signs a request with INTERNAL_HMAC_SECRET and calls Vault directly.
 * Console is a trusted internal peer — no API key needed.
 */
export async function callVault(args: VaultCallArgs): Promise<Response> {
  const vaultUrl  = process.env.VAULT_INTERNAL_URL;
  const secret    = process.env.INTERNAL_HMAC_SECRET;
  if (!vaultUrl) throw new Error("VAULT_INTERNAL_URL is not set");
  if (!secret)   throw new Error("INTERNAL_HMAC_SECRET is not set");

  const rawBody   = args.body ?? new Uint8Array();
  const ab        = new ArrayBuffer(rawBody.byteLength);
  new Uint8Array(ab).set(rawBody);
  const body      = new Uint8Array(ab);
  const timestamp = String(Date.now());
  const bodyHash  = sha256Hex(body);
  const context: Record<string, string> = {
    [X_NUBLE_APP_ID]:  args.appId,
    [X_NUBLE_USER_ID]: "console-admin",
  };
  const sig = computeHmac(args.method, args.path, bodyHash, timestamp, secret, context);

  const headers: Record<string, string> = {
    [X_NUBLE_APP_ID]:    args.appId,
    [X_NUBLE_APP_SLUG]:  args.appSlug,
    [X_NUBLE_USER_ID]:   "console-admin",
    [X_NUBLE_TIMESTAMP]: timestamp,
    [X_NUBLE_SIG]:       sig,
  };
  if (args.contentType) headers["content-type"] = args.contentType;

  return fetch(`${vaultUrl}${args.path}`, {
    method:  args.method,
    headers,
    body:    args.method === "GET" || args.method === "DELETE" ? undefined : ab,
  });
}
