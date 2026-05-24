import { computeHmac, sha256Hex } from "@nublestation/shared";

export interface SignedHeaders {
  bodyHash: string;
  timestamp: string;
  signature: string;
}

export function signRequest(
  method: string,
  path: string,
  body: Uint8Array,
  secret: string,
  context: Record<string, string>,
  now: number = Date.now(),
): SignedHeaders {
  const bodyHash = sha256Hex(body);
  const timestamp = String(now);
  const signature = computeHmac(method, path, bodyHash, timestamp, secret, context);
  return { bodyHash, timestamp, signature };
}
