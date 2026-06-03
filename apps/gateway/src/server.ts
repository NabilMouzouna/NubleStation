import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as pinoLogger } from "./logger.js";
import { health } from "./routes/health.js";
import { proxy } from "./routes/proxy.js";

// Allow any *.local origin (LAN-deployed apps) and localhost (any port) for dev.
// Returns the origin itself to echo the actual value in the ACAO header, which
// is required when credentials are involved or the port varies.
const LAN_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$|^https?:\/\/[^/]+\.local(:\d+)?$/;

export function buildServer() {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: (origin) => (LAN_ORIGIN_RE.test(origin) ? origin : ""),
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type"],
      exposeHeaders: ["Content-Type", "Content-Length"],
      maxAge: 86400,
    }),
  );

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
