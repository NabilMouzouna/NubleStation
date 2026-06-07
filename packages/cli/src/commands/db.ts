import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getProfile } from "../config.js";

export interface DbPushOptions {
  schema?: string;
  profile?: string;
}

// Spawns a Node.js child process (with --experimental-strip-types for TS support)
// that imports the developer's schema file and prints serialized JSON to stdout.
function serializeSchemaFile(schemaPath: string, cwd: string): string {
  const quotedPath = JSON.stringify(schemaPath);
  const runner = [
    "import { pathToFileURL } from 'node:url';",
    "import { serializeSchema } from '@nublestation/blaze';",
    `const mod = await import(pathToFileURL(${quotedPath}).href);`,
    "const schema = mod.schema ?? mod.default?.schema ?? mod.default;",
    "if (!schema) { process.stderr.write('No schema export found.\\n'); process.exit(1); }",
    "process.stdout.write(JSON.stringify(serializeSchema(schema)));",
  ].join("\n");

  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", runner], {
    cwd,
    encoding: "utf8",
    timeout: 15_000,
  });

  if (result.error) {
    throw new Error(`Failed to spawn schema loader: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const msg = (result.stderr ?? "").trim() || "Unknown error loading schema";
    throw new Error(`Schema load failed:\n${msg}`);
  }
  return result.stdout.trim();
}

export async function runDbPush(opts: DbPushOptions): Promise<void> {
  const cwd = process.cwd();
  const schemaRelPath = opts.schema ?? "schema.ts";
  const schemaPath = resolve(cwd, schemaRelPath);

  if (!existsSync(schemaPath)) {
    console.error(`Schema file not found: ${schemaPath}`);
    console.error("Create a schema.ts or pass --schema <path>");
    process.exit(1);
  }

  console.log(`Reading schema from ${schemaRelPath}…`);

  let serializedJson: string;
  try {
    serializedJson = serializeSchemaFile(schemaPath, cwd);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  const profile = await getProfile(opts.profile ?? "default");
  const url = `${profile.org_url}/v1/blaze/admin/migrations`;

  const parsed = JSON.parse(serializedJson) as { tables?: Record<string, unknown> };
  const tableNames = Object.keys(parsed.tables ?? {});
  if (!tableNames.length) {
    console.error("Schema has no tables. Nothing to push.");
    process.exit(1);
  }
  console.log(`Tables: ${tableNames.join(", ")}`);
  console.log(`Pushing to ${profile.org_url}…`);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${profile.api_key}`,
        "Content-Type": "application/json",
      },
      body: serializedJson,
    });
  } catch (err) {
    console.error(`Network error: ${(err as Error).message}`);
    process.exit(1);
  }

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    console.error(`Push failed (${res.status}): ${body.error ?? res.statusText}`);
    process.exit(1);
  }

  if (body.status === "no-op") {
    console.log("Schema unchanged — nothing to apply.");
  } else {
    console.log(`Applied ${body.statementsApplied as number} statement(s). Database is up to date.`);
  }
}
