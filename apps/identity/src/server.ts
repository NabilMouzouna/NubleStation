import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { loadConfig } from "./config.js";
import { logger as rootLogger } from "./logger.js";
import { onError } from "./middleware/error.js";
import { auth } from "./routes/auth.js";
import { health } from "./routes/health.js";
import { pages } from "./routes/pages.js";
import type { HonoVariables } from "./types.js";

const HEALTH_PATHS = new Set(["/healthz", "/readyz"]);

export function buildServer() {
  const cfg = loadConfig();
  const app = new Hono<{ Variables: HonoVariables }>();

  app.use("*", async (c, next) => {
    const reqId = randomUUID();
    const start = Date.now();
    const log = rootLogger.child({ reqId });
    c.set("log", log);

    await next();

    const ms     = Date.now() - start;
    const status = c.res.status;

    if (HEALTH_PATHS.has(c.req.path) && status < 300 && cfg.NODE_ENV !== "development") {
      return;
    }

    const meta = {
      reqId,
      method: c.req.method,
      path:   c.req.path,
      status,
      ms,
      ...(c.var.userId ? { userId: c.var.userId } : {}),
    };

    if (status >= 500)      log.error(meta, "req");
    else if (status >= 400) log.warn(meta, "req");
    else                    log.info(meta, "req");
  });

  app.onError(onError);

  // Health probes — no auth
  app.route("/", health);

  // JSON API consumed via the Gateway (api.{org}.local/v1/auth/*)
  app.route("/", auth);

  // User-facing pages + form posts (identity.{org}.local/*)
  app.route("/", pages);

  return app;
}
