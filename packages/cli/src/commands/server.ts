import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const INSTALL_DIR = "/var/nuble";
const ENV_FILE = `${INSTALL_DIR}/.env`;
const COMPOSE_FILE = `${INSTALL_DIR}/install/infra/docker-compose.yml`;
const PROJECT_NAME = "nublestation";

function findComposeFile(): string | null {
  if (existsSync(COMPOSE_FILE)) return COMPOSE_FILE;
  const fromEnv = process.env.NUBLE_COMPOSE_FILE;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return null;
}

function compose(args: string[], { stdio = "inherit" }: { stdio?: "inherit" | "pipe" } = {}): void {
  const composeFile = findComposeFile();
  if (!composeFile) {
    console.error("✗  Could not find docker-compose.yml.");
    console.error(`   Expected: ${COMPOSE_FILE}`);
    console.error("   Or set NUBLE_COMPOSE_FILE=/path/to/docker-compose.yml");
    process.exit(1);
  }
  if (!existsSync(ENV_FILE)) {
    console.error(`✗  Env file not found: ${ENV_FILE}`);
    process.exit(1);
  }
  const result = spawnSync(
    "docker",
    ["compose", "--env-file", ENV_FILE, "-f", composeFile, "-p", PROJECT_NAME, ...args],
    { stdio },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function serverStop(): void {
  console.log("  Stopping NubleStation…");
  compose(["stop"]);
  console.log("  ✓  Stack stopped. Data is preserved.");
}

export function serverStart(): void {
  console.log("  Starting NubleStation…");
  compose(["start"]);
  console.log("  ✓  Stack started.");
}

export function serverRestart(): void {
  console.log("  Restarting NubleStation…");
  compose(["restart"]);
  console.log("  ✓  Stack restarted.");
}

export function serverLogs(service: string | undefined, follow: boolean): void {
  const args = ["logs", "--tail", "100"];
  if (follow) args.push("-f");
  if (service) args.push(service);
  compose(args);
}

export function serverStatus(): void {
  const composeFile = findComposeFile();
  if (!composeFile) {
    console.error("✗  NubleStation not installed (compose file not found).");
    process.exit(1);
  }
  try {
    const out = execSync(
      `docker compose --env-file ${ENV_FILE} -f ${composeFile} -p ${PROJECT_NAME} ps --format "table {{.Name}}\t{{.Status}}"`,
      { encoding: "utf-8" },
    );
    console.log(out);
  } catch {
    console.error("✗  Could not reach Docker daemon.");
    process.exit(1);
  }
}
