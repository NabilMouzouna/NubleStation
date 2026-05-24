import { resolve } from "node:path";
import { getProfile } from "../config.js";
import { zipDirectory } from "../utils/zip.js";
import { uploadBundle } from "../utils/upload.js";

export interface DeployOptions {
  dist?: string;
  profile?: string;
}

export async function runDeploy(options: DeployOptions): Promise<void> {
  const profile = await getProfile(options.profile);
  const distPath = resolve(options.dist ?? "dist");

  console.log(`Deploying ${distPath} → ${profile.org_url} (${profile.app_slug})`);

  process.stdout.write("  Zipping… ");
  const zipBuffer = await zipDirectory(distPath);
  console.log(`✓ ${(zipBuffer.length / 1024).toFixed(1)} KB`);

  process.stdout.write("  Uploading… ");
  const result = await uploadBundle(profile.org_url, profile.api_key, zipBuffer);

  if (!result.ok) {
    console.log("✗");
    console.error(`\nDeploy failed: ${result.error ?? "unknown error"}`);
    process.exit(1);
  }

  console.log(`✓ version ${result.version}`);
  console.log(`\n✓ Deployed to ${profile.app_slug}.${new URL(profile.org_url).hostname.replace(/^api\./, "")}`);
}
