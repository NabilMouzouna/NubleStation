import { randomBytes } from "node:crypto";
import { request } from "undici";
import {
  X_NUBLE_APP_ID,
  X_NUBLE_APP_SLUG,
  X_NUBLE_SIG,
  X_NUBLE_TIMESTAMP,
  X_NUBLE_USER_ID,
  computeHmac,
  sha256Hex,
} from "@nublestation/shared";
import { loadConfig } from "../config.js";
import { getSystemAppId } from "./system-app.js";

const AVATAR_COLLECTION = "avatars";
const SYSTEM_USER = "identity-system";

/**
 * Signs an internal request to Vault and sends it. Identity is a trusted peer:
 * it authenticates with the shared HMAC secret (not an API key), signing as the
 * reserved system app. Mirrors the gateway's forwardSigned contract so Vault's
 * hmac middleware verifies it (ADR 003 §14, ADR 014 §5).
 */
async function callVault(
  method: string,
  path: string,
  body: Buffer,
  contentType: string | null,
) {
  const cfg = loadConfig();
  const appId = getSystemAppId();
  const slug = cfg.IDENTITY_SYSTEM_APP_SLUG;
  const timestamp = String(Date.now());
  const bodyHash = sha256Hex(body);
  const context: Record<string, string> = {
    [X_NUBLE_APP_ID]:  appId,
    [X_NUBLE_USER_ID]: SYSTEM_USER,
  };
  const sig = computeHmac(method, path, bodyHash, timestamp, cfg.INTERNAL_HMAC_SECRET, context);

  const headers: Record<string, string> = {
    [X_NUBLE_APP_ID]:    appId,
    [X_NUBLE_APP_SLUG]:  slug,
    [X_NUBLE_USER_ID]:   SYSTEM_USER,
    [X_NUBLE_TIMESTAMP]: timestamp,
    [X_NUBLE_SIG]:       sig,
  };
  if (contentType) headers["content-type"] = contentType;

  return request(`${cfg.VAULT_INTERNAL_URL}${path}`, {
    method: method as "GET" | "POST" | "PATCH" | "DELETE",
    headers,
    body: method === "GET" || method === "DELETE" ? undefined : body,
  });
}

/** Encodes a single-file multipart/form-data body with an exact byte layout so
 *  the HMAC body hash matches what Vault receives. */
function encodeMultipart(
  field: string,
  filename: string,
  fileType: string,
  bytes: Uint8Array,
): { body: Buffer; contentType: string } {
  const boundary = `----nuble${randomBytes(16).toString("hex")}`;
  const head =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
    `Content-Type: ${fileType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([Buffer.from(head, "utf8"), Buffer.from(bytes), Buffer.from(tail, "utf8")]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

/**
 * Uploads (or replaces) a user's avatar in the system bucket, makes it public,
 * and returns its public URL. Replace-safe: deletes any existing file at the
 * same path first (Vault has no overwrite).
 */
export async function uploadAvatar(
  userId: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  const cfg = loadConfig();
  const ext = mimeType === "image/png" ? "png"
    : mimeType === "image/webp" ? "webp"
    : mimeType === "image/gif" ? "gif"
    : "jpg";
  const filename = `${userId}.${ext}`;
  const base = `/v1/vault/files/${AVATAR_COLLECTION}/${filename}`;

  // Best-effort delete of a prior avatar at this exact path (ignore 404).
  await callVault("DELETE", base, Buffer.alloc(0), null).catch(() => undefined);

  const { body, contentType } = encodeMultipart("file", filename, mimeType, bytes);
  const up = await callVault("POST", base, body, contentType);
  if (up.statusCode >= 300) {
    throw new Error(`vault avatar upload failed: ${up.statusCode}`);
  }

  const patchBody = Buffer.from(JSON.stringify({ isPublic: true }), "utf8");
  const pub = await callVault("PATCH", base, patchBody, "application/json");
  if (pub.statusCode >= 300) {
    throw new Error(`vault setPublic failed: ${pub.statusCode}`);
  }

  return `http://api.${cfg.ORG_DOMAIN}.local/vault/${cfg.IDENTITY_SYSTEM_APP_SLUG}/${AVATAR_COLLECTION}/${filename}`;
}
