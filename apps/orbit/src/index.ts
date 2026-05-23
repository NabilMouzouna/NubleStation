import { mkdir } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { buildServer } from "./server.js";

async function main() {
  const cfg = loadConfig();

  try {
    await mkdir(cfg.STORAGE_ROOT, { recursive: true });
  } catch (err) {
    logger.fatal({ err, storageRoot: cfg.STORAGE_ROOT }, "cannot create storage root; refusing to start");
    process.exit(1);
  }

  const app = buildServer();
  const server = serve({ fetch: app.fetch, port: cfg.PORT }, (info) => {
    logger.info({ port: info.port, storageRoot: cfg.STORAGE_ROOT }, "deploy service listening");
  });

  const shutdown = (sig: string) => {
    logger.info({ sig }, "shutting down");
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "fatal boot error");
  process.exit(1);
});
