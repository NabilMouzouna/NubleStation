// Seeds a demo organization + app + api_key for manual end-to-end testing.
// Prints the plaintext API key to stdout. Run once on the local dev DB; safe
// to re-run — existing rows are reused.
//
//   pnpm --filter @nublestation/blaze exec tsx scripts/seed-demo.ts
//
import { randomBytes } from "node:crypto";
import { hash as argon2Hash } from "@node-rs/argon2";
import { closePool, getPool } from "../src/db/pool.js";

async function main() {
  const pool = getPool();

  const org = await pool.query<{ id: string }>(
    `INSERT INTO platform.organizations (name, subdomain_root, admin_email)
     VALUES ('Demo Clinic', 'nuble', 'admin@nuble.local')
     ON CONFLICT DO NOTHING
     RETURNING id`,
  );
  const orgId =
    org.rows[0]?.id ??
    (
      await pool.query<{ id: string }>(
        "SELECT id FROM platform.organizations WHERE name = 'Demo Clinic'",
      )
    ).rows[0]!.id;

  const app = await pool.query<{ id: string }>(
    `INSERT INTO platform.apps (name, display_name)
     VALUES ('demo', 'Demo App')
     ON CONFLICT (name) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING id`,
  );
  const appId = app.rows[0]!.id;

  const keyId = randomBytes(8).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  const secretHash = await argon2Hash(secret);

  await pool.query(
    `INSERT INTO platform.api_keys (app_id, key_id, secret_hash, label)
     VALUES ($1, $2, $3, 'demo-seed')`,
    [appId, keyId, secretHash],
  );

  console.log(JSON.stringify({ orgId, appId, keyId, apiKey: `nbl_${keyId}.${secret}` }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
