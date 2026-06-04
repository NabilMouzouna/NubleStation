import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { buildServer } from "./server.js";
import { ensureSystemApp } from "./services/system-app.js";

async function main() {
  const cfg = loadConfig();

  // Reserve the system app that owns the avatar bucket (idempotent).
  try {
    const systemAppId = await ensureSystemApp();
    logger.info({ systemAppId, slug: cfg.IDENTITY_SYSTEM_APP_SLUG }, "system app ready");
  } catch (err) {
    logger.fatal({ err }, "cannot ensure system app; refusing to start");
    process.exit(1);
  }

  const app    = buildServer();
  const server = serve({ fetch: app.fetch, port: cfg.PORT }, (info) => {
    logger.info({ port: info.port, orgDomain: cfg.ORG_DOMAIN }, "identity service listening");
  });

  const shutdown = (sig: string) => {
    logger.info({ sig }, "shutting down");
    server.close();
    process.exit(0);
  };
  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "fatal boot error");
  process.exit(1);
});
