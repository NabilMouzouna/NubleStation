import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "nuble_console";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface AdminSession {
  userId: string;
  email: string;
  role: string;
}

function secret(): string {
  const s = process.env.INTERNAL_HMAC_SECRET;
  if (!s) throw new Error("INTERNAL_HMAC_SECRET is not set");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function encode(data: AdminSession & { exp: number }): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(token: string): (AdminSession & { exp: number }) | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(sign(payload), "hex"))) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function createSession(userId: string, email: string, role: string): Promise<void> {
  const exp = Date.now() + SESSION_TTL_MS;
  const token = encode({ userId, email, role, exp });
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SECURE_COOKIES === "true",
    expires: new Date(exp),
    path: "/",
  });
}

export async function validateSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const data = decode(token);
  if (!data || data.exp < Date.now()) return null;
  return { userId: data.userId, email: data.email, role: data.role };
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
