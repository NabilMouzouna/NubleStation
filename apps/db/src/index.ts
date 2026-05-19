import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { getPool, closePool } from "./db/pool.js";
import { runPlatformMigrations, recordSchemaVersion } from "./db/migrate.js";
import { logger } from "./logger.js";
import { buildServer } from "./server.js";

async function main() {
  const cfg = loadConfig();
  const pool = getPool();

  try {
    await runPlatformMigrations(pool);
    await recordSchemaVersion(pool);
  } catch (err) {
    logger.fatal({ err }, "platform migrations failed; refusing to serve traffic");
    process.exit(1);
  }

  const app = buildServer();
  const server = serve({ fetch: app.fetch, port: cfg.PORT }, (info) => {
    logger.info({ port: info.port }, "db service listening");
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
