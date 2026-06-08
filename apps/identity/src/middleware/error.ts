import type { ErrorHandler } from "hono";
import type { HonoVariables } from "../types.js";

export const onError: ErrorHandler<{ Variables: HonoVariables }> = (err, c) => {
  const log = c.var.log;
  log?.error({ err }, "unhandled error");
  return c.json({ ok: false, error: "internal_error" }, 500);
};
