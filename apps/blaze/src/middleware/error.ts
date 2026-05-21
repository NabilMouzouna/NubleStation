import type { ErrorHandler } from "hono";
import { logger } from "../logger.js";

export const onError: ErrorHandler = (err, c) => {
  logger.error({ err, path: c.req.path, method: c.req.method }, "request failed");
  const status = (err as { status?: number }).status;
  return c.json(
    { ok: false, error: "internal_error" },
    status && status >= 400 && status < 600 ? (status as 400) : 500,
  );
};
