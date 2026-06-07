"use server";

import { verify } from "@node-rs/argon2";
import { redirect } from "next/navigation";
import { getPool } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

export async function login(
  _prev: unknown,
  formData: FormData
): Promise<{ error: string }> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";
  const password = formData.get("password") as string | null ?? "";

  if (!email || !password) return { error: "Email and password are required." };

  const pool = getPool();
  const { rows } = await pool.query<{ id: string; password_hash: string; role: string }>(
    `SELECT id, password_hash, role
     FROM platform.users
     WHERE email = $1
       AND role IN ('super_admin', 'admin')
       AND is_active = true`,
    [email],
  );

  const INVALID = { error: "Invalid email or password." };
  const row = rows[0];
  if (!row) return INVALID;

  const valid = await verify(row.password_hash, password);
  if (!valid) return INVALID;

  await createSession(row.id, email, row.role);
  redirect("/dashboard");
}
