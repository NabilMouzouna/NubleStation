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
  context?: Record<string, string>,
): string {
  let payload = `${method.toUpperCase()}\n${path}\n${bodyHashHex}\n${timestamp}`;
  if (context && Object.keys(context).length > 0) {
    const lines = Object.entries(context)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k.toLowerCase()}:${v}`)
      .join("\n");
    payload += `\n${lines}`;
  }
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
