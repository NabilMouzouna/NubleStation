import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { loadConfig } from "./config.js";
import { logger as rootLogger } from "./logger.js";
import { onError } from "./middleware/error.js";
import { hmacAuth } from "./middleware/hmac.js";
import { health } from "./routes/health.js";
import { deploy } from "./routes/deploy.js";
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

    const ms = Date.now() - start;
    const status = c.res.status;

    // Suppress successful health-check polls outside dev to keep logs clean.
    if (HEALTH_PATHS.has(c.req.path) && status < 300 && cfg.NODE_ENV !== "development") {
      return;
    }

    const meta = {
      reqId,
      method: c.req.method,
      path: c.req.path,
      status,
      ms,
      ...(c.var.appId ? { appId: c.var.appId, userId: c.var.userId, appSlug: c.var.appSlug } : {}),
    };

    if (status >= 500) log.error(meta, "req");
    else if (status >= 400) log.warn(meta, "req");
    else log.info(meta, "req");
  });

  app.onError(onError);

  app.route("/", health);

  app.use("/v1/*", hmacAuth);
  app.route("/", deploy);

  return app;
}
