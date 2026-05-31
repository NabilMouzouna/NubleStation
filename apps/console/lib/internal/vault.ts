import { createHmac, createHash } from "node:crypto";

// Header names from packages/shared/src/headers.ts — copied to avoid
// importing TypeScript source files into the Next.js build (Turbopack
// cannot resolve .ts workspace packages that export via ./src/index.ts).
const X_APP_ID   = "x-nuble-app-id";
const X_APP_SLUG = "x-nuble-app-slug";
const X_USER_ID  = "x-nuble-user-id";
const X_TS       = "x-nuble-timestamp";
const X_SIG      = "x-nuble-sig";

function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function sign(
  method: string,
  path: string,
  bodyHash: string,
  timestamp: string,
  secret: string,
  context: Record<string, string>,
): string {
  const ctxLines = Object.entries(context)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k.toLowerCase()}:${v}`)
    .join("\n");
  const payload = `${method.toUpperCase()}\n${path}\n${bodyHash}\n${timestamp}\n${ctxLines}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

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
  const vaultUrl = process.env.VAULT_INTERNAL_URL;
  const secret   = process.env.INTERNAL_HMAC_SECRET;
  if (!vaultUrl) throw new Error("VAULT_INTERNAL_URL is not set");
  if (!secret)   throw new Error("INTERNAL_HMAC_SECRET is not set");

  const rawBody   = args.body ?? new Uint8Array();
  const ab        = new ArrayBuffer(rawBody.byteLength);
  new Uint8Array(ab).set(rawBody);
  const body      = new Uint8Array(ab);

  const timestamp = String(Date.now());
  const bodyHash  = sha256Hex(body);
  const context   = { [X_APP_ID]: args.appId, [X_USER_ID]: "console-admin" };
  const sig       = sign(args.method, args.path, bodyHash, timestamp, secret, context);

  const headers: Record<string, string> = {
    [X_APP_ID]:   args.appId,
    [X_APP_SLUG]: args.appSlug,
    [X_USER_ID]:  "console-admin",
    [X_TS]:       timestamp,
    [X_SIG]:      sig,
  };
  if (args.contentType) headers["content-type"] = args.contentType;

  return fetch(`${vaultUrl}${args.path}`, {
    method:  args.method,
    headers,
    body:    args.method === "GET" || args.method === "DELETE" ? undefined : ab,
  });
}

