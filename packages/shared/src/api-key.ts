export interface ParsedApiKey {
  keyId: string;
  secret: string;
}

const PREFIX = "nbl_";

export function parseApiKey(raw: string | null | undefined): ParsedApiKey | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith(PREFIX)) return null;
  const body = trimmed.slice(PREFIX.length);
  const dot = body.indexOf(".");
  if (dot <= 0 || dot === body.length - 1) return null;
  const keyId = body.slice(0, dot);
  const secret = body.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(keyId)) return null;
  if (secret.length < 16) return null;
  return { keyId, secret };
}

export function parseBearerToken(authHeader: string | null | undefined): ParsedApiKey | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return null;
  return parseApiKey(match[1]);
}
