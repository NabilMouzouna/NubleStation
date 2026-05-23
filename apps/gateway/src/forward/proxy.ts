import { request, type Dispatcher } from "undici";
import {
  X_NUBLE_APP_ID,
  X_NUBLE_APP_SLUG,
  X_NUBLE_SIG,
  X_NUBLE_TIMESTAMP,
  X_NUBLE_USER_ID,
} from "@nublestation/shared";
import { signRequest } from "./sign.js";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
]);

export interface ForwardArgs {
  upstreamBaseUrl: string;
  method: string;
  path: string;
  body: Uint8Array;
  appId: string;
  userId: string;
  hmacSecret: string;
  contentType?: string | null;
  appSlug?: string;
}

export interface ForwardResult {
  status: number;
  headers: Record<string, string | string[]>;
  body: Uint8Array;
}

/**
 * Signs `body` with the shared HMAC secret and forwards the request to the
 * target internal service. The `appSlug` field is forwarded as a trusted
 * header when provided (Orbit requires it to select the deploy directory).
 *
 * ADR 003 §14: signed internal headers.
 */
export async function forwardSigned(args: ForwardArgs): Promise<ForwardResult> {
  const signed = signRequest(args.method, args.path, args.body, args.hmacSecret);

  const targetUrl = new URL(args.path, args.upstreamBaseUrl).toString();
  const headers: Record<string, string> = {
    [X_NUBLE_APP_ID]: args.appId,
    [X_NUBLE_USER_ID]: args.userId,
    [X_NUBLE_TIMESTAMP]: signed.timestamp,
    [X_NUBLE_SIG]: signed.signature,
  };
  if (args.appSlug) headers[X_NUBLE_APP_SLUG] = args.appSlug;
  if (args.contentType) headers["content-type"] = args.contentType;

  const upstream = await request(targetUrl, {
    method: args.method as Dispatcher.HttpMethod,
    headers,
    body: args.method === "GET" || args.method === "HEAD" ? undefined : args.body,
  });

  const respBody = new Uint8Array(await upstream.body.arrayBuffer());
  const respHeaders: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(upstream.headers)) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    if (v !== undefined) respHeaders[k] = v;
  }
  return { status: upstream.statusCode, headers: respHeaders, body: respBody };
}
