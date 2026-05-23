import { mkdir } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { closePool, getPool } from "./db/pool.js";
import { logger } from "./logger.js";
import { buildServer } from "./server.js";

async function main() {
  const cfg = loadConfig();

  // Ensure storage root exists before accepting traffic.
  try {
    await mkdir(cfg.STORAGE_ROOT, { recursive: true });
  } catch (err) {
    logger.fatal({ err, storageRoot: cfg.STORAGE_ROOT }, "cannot create storage root; refusing to start");
    process.exit(1);
  }

  // Verify DB connectivity.
  try {
    await getPool().query("SELECT 1");
  } catch (err) {
    logger.fatal({ err }, "db unreachable; refusing to start");
    process.exit(1);
  }

  const app = buildServer();
  const server = serve({ fetch: app.fetch, port: cfg.PORT }, (info) => {
    logger.info({ port: info.port, storageRoot: cfg.STORAGE_ROOT }, "deploy service listening");
  });

  const shutdown = async (sig: string) => {
    logger.info({ sig }, "shutting down");
    server.close();
    await closePool();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "fatal boot error");
  process.exit(1);
});
