import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "smol-toml";

export interface NubleProfile {
  org_url: string;
  api_key: string;
  app_slug: string;
}

export type NubleConfig = Record<string, NubleProfile>;

const CONFIG_DIR = join(homedir(), ".nuble");
const CONFIG_PATH = join(CONFIG_DIR, "config");

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export async function readConfig(): Promise<NubleConfig> {
  if (!existsSync(CONFIG_PATH)) return {};
  const raw = await readFile(CONFIG_PATH, "utf8");
  return parse(raw) as unknown as NubleConfig;
}

export async function writeConfig(config: NubleConfig): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  await writeFile(CONFIG_PATH, stringify(config as unknown as Record<string, Record<string, unknown>>), "utf8");
}

export async function getProfile(profile = "default"): Promise<NubleProfile> {
  const config = await readConfig();
  const p = config[profile];
  if (!p) {
    throw new Error(
      `Profile "${profile}" not found in ${CONFIG_PATH}.\nRun \`nuble init\` first.`,
    );
  }
  return p;
}

export async function setProfile(
  data: NubleProfile,
  profile = "default",
): Promise<void> {
  const config = await readConfig();
  config[profile] = data;
  await writeConfig(config);
}
