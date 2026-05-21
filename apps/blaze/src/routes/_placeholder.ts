import { Hono } from "hono";
import type { HonoVariables } from "../types.js";

export const placeholder = new Hono<{ Variables: HonoVariables }>();

placeholder.all("/v1/db/*", (c) =>
  c.json(
    {
      ok: false,
      error: "not_implemented",
      message:
        "DB service auto-REST is not implemented yet (Phase 3). HMAC chain proven by reaching this route.",
      appId: c.get("appId"),
    },
    501,
  ),
);
