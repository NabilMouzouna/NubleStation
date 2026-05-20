import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function sha256Hex(body: Uint8Array | string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function computeHmac(
  method: string,
  path: string,
  bodyHashHex: string,
  timestamp: string,
  secret: string,
): string {
  const payload = `${method.toUpperCase()}\n${path}\n${bodyHashHex}\n${timestamp}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyHmac(
  expectedHex: string,
  presentedHex: string,
): boolean {
  if (expectedHex.length !== presentedHex.length) return false;
  return timingSafeEqual(
    Buffer.from(expectedHex, "hex"),
    Buffer.from(presentedHex, "hex"),
  );
}
