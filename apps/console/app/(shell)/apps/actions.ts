"use server";

import { createApp } from "@/lib/platform/apps";

export interface CreateAppState {
  ok: boolean;
  appId?: string;
  apiKey?: string;
  error?: string;
}

export async function createAppAction(
  displayName: string,
  slug: string,
): Promise<CreateAppState> {
  try {
    const result = await createApp(displayName, slug);
    return { ok: true, appId: result.appId, apiKey: result.apiKey };
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "invalid_slug") return { ok: false, error: "Slug is invalid. Use lowercase letters, numbers, and hyphens only." };
    if (msg === "display_name_required") return { ok: false, error: "App name is required." };
    // Unique constraint violation (duplicate slug)
    if (msg.includes("apps_name_uq")) return { ok: false, error: `An app named "${slug}" already exists.` };
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
