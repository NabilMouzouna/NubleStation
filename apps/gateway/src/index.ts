import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { closePool } from "./db.js";
import { logger } from "./logger.js";
import { buildServer } from "./server.js";

async function main() {
  const cfg = loadConfig();
  const app = buildServer();
  const server = serve({ fetch: app.fetch, port: cfg.PORT }, (info) => {
    logger.info({ port: info.port }, "gateway listening");
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
