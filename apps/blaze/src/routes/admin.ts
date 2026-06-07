import { SchemaError } from "@nublestation/blaze";
import type { SerializedSchema } from "@nublestation/blaze";
import { Hono } from "hono";
import { applyMigration } from "../migrations/apply.js";
import type { HonoVariables } from "../types.js";

export const admin = new Hono<{ Variables: HonoVariables }>();

async function handleMigrationPush(c: any): Promise<Response> {
  const callerAppId: string = c.var.appId;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    (body as any).version !== 1 ||
    typeof (body as any).tables !== "object"
  ) {
    return c.json({ error: "Body must be a SerializedSchema (version: 1)" }, 422);
  }

  const schema = body as SerializedSchema;

  try {
    const result = await applyMigration(callerAppId, schema);
    if (result.noOp) {
      return c.json({ status: "no-op", message: "Schema unchanged" }, 200);
    }
    return c.json(
      { status: "applied", statementsApplied: result.statementsApplied },
      200,
    );
  } catch (err) {
    if (err instanceof SchemaError) {
      return c.json({ error: err.message }, 422);
    }
    throw err;
  }
}

// Explicit appId in path — for integrations that already know the app UUID.
admin.post("/v1/blaze/admin/apps/:appId/migrations", async (c) => {
  // The Gateway resolves the API key → appId and injects it via HMAC-signed headers.
  // The route param must match — reject cross-app migration attempts.
  if (c.req.param("appId") !== c.var.appId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return handleMigrationPush(c);
});

// No appId in path — used by the CLI (appId comes from HMAC headers, no UUID required).
admin.post("/v1/blaze/admin/migrations", handleMigrationPush);
