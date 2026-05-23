import { Hono } from "hono";
import { logger as pinoLogger } from "./logger.js";
import { onError } from "./middleware/error.js";
import { hmacAuth } from "./middleware/hmac.js";
import { health } from "./routes/health.js";
import { deploy } from "./routes/deploy.js";
import type { HonoVariables } from "./types.js";

export function buildServer() {
  const app = new Hono<{ Variables: HonoVariables }>();

  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    pinoLogger.info(
      { method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - start },
      "req",
    );
  });

  app.onError(onError);

  app.route("/", health);

  app.use("/v1/*", hmacAuth);
  app.route("/", deploy);

  return app;
}
