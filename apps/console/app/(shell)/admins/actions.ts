"use server";

import { hash } from "@node-rs/argon2";
import { revalidatePath } from "next/cache";
import { getPool } from "@/lib/db";

export async function createAdminAction(
  formData: FormData,
): Promise<{ error: string } | void> {
  const email = (formData.get("email") as string).trim().toLowerCase();
  const displayName = (formData.get("display_name") as string | null)?.trim() || null;
  const password = formData.get("password") as string;

  if (!email || !password) return { error: "Email and password are required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const passwordHash = await hash(password);

  try {
    await getPool().query(
      `INSERT INTO platform.users (email, password_hash, role, display_name, is_active)
       VALUES ($1, $2, 'admin', $3, true)`,
      [email, passwordHash, displayName],
    );
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23505") {
      return { error: "An admin with this email already exists." };
    }
    return { error: "Failed to create admin." };
  }

  revalidatePath("/admins");
}
