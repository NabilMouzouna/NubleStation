#!/usr/bin/env tsx
/**
 * Manual E2E test: signs requests directly to Orbit (bypassing Gateway).
 *
 * Usage:
 *   ORBIT_URL=http://localhost:3002 \
 *   INTERNAL_HMAC_SECRET=dev-secret-not-for-prod-must-be-min-16 \
 *   tsx apps/orbit/scripts/e2e-manual.ts
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  X_NUBLE_APP_ID,
  X_NUBLE_APP_SLUG,
  X_NUBLE_SIG,
  X_NUBLE_TIMESTAMP,
  X_NUBLE_USER_ID,
  computeHmac,
  sha256Hex,
} from "@nublestation/shared";
import archiver from "archiver";

const ORBIT_URL = process.env.ORBIT_URL ?? "http://localhost:3002";
const SECRET = process.env.INTERNAL_HMAC_SECRET ?? "dev-secret-not-for-prod-must-be-min-16";
const APP_ID = process.env.TEST_APP_ID ?? "00000000-0000-0000-0000-000000000001";
const USER_ID = process.env.TEST_USER_ID ?? "00000000-0000-0000-0000-000000000002";
const APP_SLUG = process.env.TEST_APP_SLUG ?? "e2e-test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sign(method: string, path: string, body: Uint8Array): Record<string, string> {
  const timestamp = String(Date.now());
  const bodyHash = sha256Hex(body);
  const sig = computeHmac(method, path, bodyHash, timestamp, SECRET);
  return {
    [X_NUBLE_APP_ID]: APP_ID,
    [X_NUBLE_USER_ID]: USER_ID,
    [X_NUBLE_APP_SLUG]: APP_SLUG,
    [X_NUBLE_TIMESTAMP]: timestamp,
    [X_NUBLE_SIG]: sig,
  };
}

async function makeZip(files: Record<string, string>): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const arc = archiver("zip", { zlib: { level: 0 } });
    arc.on("data", (c: Buffer) => chunks.push(c));
    arc.on("finish", () => resolve(Buffer.concat(chunks)));
    arc.on("error", reject);
    for (const [name, content] of Object.entries(files)) {
      arc.append(Buffer.from(content), { name });
    }
    arc.finalize();
  });
}

async function sendDeploy(zipBytes: Buffer): Promise<unknown> {
  const form = new FormData();
  form.append("bundle", new Blob([new Uint8Array(zipBytes)], { type: "application/zip" }), "bundle.zip");

  const tmp = new Request(`${ORBIT_URL}/v1/orbit/deploy`, { method: "POST", body: form });
  const bodyBytes = new Uint8Array(await tmp.arrayBuffer());
  const contentType = tmp.headers.get("content-type")!;
  const hdrs = sign("POST", "/v1/orbit/deploy", bodyBytes);

  const res = await fetch(`${ORBIT_URL}/v1/orbit/deploy`, {
    method: "POST",
    body: bodyBytes,
    headers: { "content-type": contentType, ...hdrs },
  });
  return res.json();
}

async function sendRollback(): Promise<unknown> {
  const bodyBytes = new Uint8Array(0);
  const hdrs = sign("POST", "/v1/orbit/rollback", bodyBytes);
  const res = await fetch(`${ORBIT_URL}/v1/orbit/rollback`, {
    method: "POST",
    headers: hdrs,
  });
  return res.json();
}

function ok(label: string, passed: boolean, detail = "") {
  const icon = passed ? "✓" : "✗";
  console.log(`${icon} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!passed) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

async function run() {
  console.log(`\nOrbit E2E manual test → ${ORBIT_URL}\n`);

  // 1. Healthz
  {
    const res = await fetch(`${ORBIT_URL}/healthz`);
    const body = (await res.json()) as { ok: boolean };
    ok("GET /healthz", res.status === 200 && body.ok);
  }

  // 2. Readyz
  {
    const res = await fetch(`${ORBIT_URL}/readyz`);
    const body = (await res.json()) as { ok: boolean };
    ok("GET /readyz", res.status === 200 && body.ok);
  }

  // 3. Deploy without auth → 401
  {
    const form = new FormData();
    form.append("bundle", new Blob([new Uint8Array([1])], { type: "application/zip" }), "b.zip");
    const res = await fetch(`${ORBIT_URL}/v1/orbit/deploy`, { method: "POST", body: form });
    ok("POST /v1/orbit/deploy without auth → 401", res.status === 401);
  }

  // 4. Deploy valid bundle → 200
  const zipV1 = await makeZip({ "index.html": "<h1>v1</h1>", "app.js": "console.log(1)" });
  {
    const body = (await sendDeploy(zipV1)) as { ok: boolean; version: string; appSlug: string };
    ok(
      "POST /v1/orbit/deploy valid bundle → 200",
      body.ok,
      `version=${body.version} slug=${body.appSlug}`,
    );
  }

  // 5. Rollback when no .previous → 409
  {
    const body = (await sendRollback()) as { ok: boolean; error: string };
    ok("POST /v1/orbit/rollback (no previous) → 409", !body.ok && body.error === "no_previous_version");
  }

  // 6. Second deploy → creates .previous
  const zipV2 = await makeZip({ "index.html": "<h1>v2</h1>" });
  {
    const body = (await sendDeploy(zipV2)) as { ok: boolean };
    ok("POST /v1/orbit/deploy second bundle (creates .previous)", body.ok);
  }

  // 7. Rollback → 200
  {
    const body = (await sendRollback()) as { ok: boolean };
    ok("POST /v1/orbit/rollback → 200", body.ok);
  }

  // 8. Zip missing index.html → 422
  const badZip = await makeZip({ "app.js": "console.log(1)" });
  {
    const body = (await sendDeploy(badZip)) as { ok: boolean; error: string };
    ok(
      "POST /v1/orbit/deploy (no index.html) → 422",
      !body.ok && body.error === "missing_index_html",
    );
  }

  console.log(
    `\n${process.exitCode ? "Some tests failed." : "All tests passed."}`,
  );
}

run().catch((err) => {
  console.error("\nFatal:", (err as Error).message);
  process.exit(1);
});
