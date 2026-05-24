import { readConfig } from "../config.js";
import { checkGatewayHealth } from "../utils/upload.js";
import { printBranding } from "../branding.js";

export async function runStatus(): Promise<void> {
  printBranding("nuble status");
  const config = await readConfig();
  const profiles = Object.keys(config);

  if (profiles.length === 0) {
    console.log("No profiles configured. Run `nuble init` first.");
    return;
  }

  for (const name of profiles) {
    const p = config[name];
    if (!p) continue;
    process.stdout.write(`[${name}] ${p.org_url} — checking… `);
    const health = await checkGatewayHealth(p.org_url);
    if (health.reachable) {
      console.log("✓ online");
    } else {
      console.log(`✗ unreachable (${health.error ?? `HTTP ${health.status}`})`);
    }
  }
}
