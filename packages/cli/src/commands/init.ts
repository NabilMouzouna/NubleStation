import { input } from "@inquirer/prompts";
import { setProfile } from "../config.js";
import { checkGatewayHealth } from "../utils/upload.js";
import { printBranding } from "../branding.js";

export async function runInit(options: { profile?: string }): Promise<void> {
  printBranding("nuble init");

  // In staging/production the install script sets NUBLE_GATEWAY_URL so the
  // user doesn't need to type it in.
  const envUrl = process.env.NUBLE_GATEWAY_URL;

  let orgUrl: string;
  if (envUrl) {
    try { new URL(envUrl); } catch {
      console.error(`NUBLE_GATEWAY_URL is set but not a valid URL: ${envUrl}`);
      process.exit(1);
    }
    console.log(`  Gateway: ${envUrl}  (from NUBLE_GATEWAY_URL)\n`);
    orgUrl = envUrl;
  } else {
    orgUrl = await input({
      message: "Gateway URL (e.g. http://api.clinic.local):",
      validate: (v) => {
        try { new URL(v); return true; }
        catch { return "Enter a valid URL (http://...)"; }
      },
    });
  }

  const apiKey = await input({
    message: "API key (nbl_<keyId>.<secret>):",
    validate: (v) => v.startsWith("nbl_") || "Key must start with nbl_",
  });

  const appSlug = await input({
    message: "App slug (e.g. tasks):",
    validate: (v) =>
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(v) ||
      "Slug must be lowercase alphanumeric with hyphens",
  });

  process.stdout.write("\nChecking gateway reachability… ");
  const health = await checkGatewayHealth(orgUrl);
  if (!health.reachable) {
    console.log("✗ unreachable");
    console.error(`\nError: ${health.error ?? `HTTP ${health.status}`}`);
    console.error(`Make sure ${orgUrl} is reachable from this machine.`);
    process.exit(1);
  }
  console.log("✓ online\n");

  const profile = options.profile ?? "default";
  await setProfile({ org_url: orgUrl, api_key: apiKey, app_slug: appSlug }, profile);

  console.log(`✓ Config written (profile: ${profile})`);
  console.log(`  Gateway:  ${orgUrl}`);
  console.log(`  App slug: ${appSlug}`);
  console.log("\nRun `nuble deploy` to push your first build.");
}
