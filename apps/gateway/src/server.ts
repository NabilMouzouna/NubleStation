import { Hono } from "hono";
import { logger as pinoLogger } from "./logger.js";
import { health } from "./routes/health.js";
import { proxy } from "./routes/proxy.js";

export function buildServer() {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    pinoLogger.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Date.now() - start,
      },
      "req",
    );
  });

  app.onError((err, c) => {
    pinoLogger.error({ err, path: c.req.path }, "gateway error");
    return c.json({ ok: false, error: "internal_error" }, 500);
  });

  app.route("/", health);
  app.route("/", proxy);
  return app;
}
