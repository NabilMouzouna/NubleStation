import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { getProfile } from "../config.js";
import { zipDirectory } from "../utils/zip.js";
import { uploadBundle } from "../utils/upload.js";
import { printBranding } from "../branding.js";

export interface DeployOptions {
  dist?: string;
  profile?: string;
  build?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectPackageManager(cwd: string): string {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock")))       return "yarn";
  return "npm";
}

// Parse a .env file into a key→value map. Ignores comments and blank lines.
function loadDotenv(cwd: string): Record<string, string> {
  const envPath = join(cwd, ".env");
  if (!existsSync(envPath)) return {};
  const vars: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

function runBuild(cwd: string): void {
  const pm  = detectPackageManager(cwd);
  const env = { ...process.env, ...loadDotenv(cwd) };

  process.stdout.write("  Building… ");
  const result = spawnSync(pm, ["run", "build"], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    console.log("✗");
    const output = (result.stderr?.toString() ?? "") || (result.stdout?.toString() ?? "");
    console.error(`\nBuild failed:\n${output.trim()}`);
    process.exit(1);
  }
  console.log("✓");
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export async function runDeploy(options: DeployOptions): Promise<void> {
  printBranding("nuble deploy");
  const profile  = await getProfile(options.profile);
  const cwd      = process.cwd();
  const distPath = resolve(options.dist ?? "dist");

  console.log(`Deploying ${distPath} → ${profile.org_url} (${profile.app_slug})`);

  if (options.build) {
    // Verify package.json exists so we know we're in a project root
    if (!existsSync(join(cwd, "package.json"))) {
      console.error("No package.json found in current directory — run from your project root.");
      process.exit(1);
    }
    runBuild(cwd);
  }

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
