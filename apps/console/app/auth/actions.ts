"use server";

import { verify } from "@node-rs/argon2";
import { redirect } from "next/navigation";
import db from "@/lib/db";
import { createSession } from "@/lib/auth/session";

export async function login(
  _prev: unknown,
  formData: FormData
): Promise<{ error: string }> {
  const email = (formData.get("email") as string).trim().toLowerCase();
  const password = formData.get("password") as string;

  const row = db
    .prepare(`SELECT id, password_hash FROM admin_users WHERE email = ?`)
    .get(email) as { id: string; password_hash: string } | undefined;

  // Same message for unknown email and wrong password — never leak which one
  const INVALID = { error: "Invalid email or password." };

  if (!row) return INVALID;

  const valid = await verify(row.password_hash, password);
  if (!valid) return INVALID;

  await createSession(row.id);
  redirect("/dashboard");
}
