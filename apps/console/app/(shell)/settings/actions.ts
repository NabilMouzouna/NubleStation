"use server";

import { revalidatePath } from "next/cache";
import { getOrg, updateOrgName } from "@/lib/platform/org";

export async function updateOrgAction(formData: FormData): Promise<void> {
  const name = (formData.get("name") as string | null)?.trim();
  if (!name) return;

  const org = await getOrg();
  if (!org) return;

  await updateOrgName(org.id, name);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}
