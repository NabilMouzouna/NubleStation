import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetConfigCache } from "../src/config.js";
import { buildServer } from "../src/server.js";
import { TEST_APP_SLUG, TEST_HMAC_SECRET, makeSignedHeaders } from "./helpers/sign.js";
import { makeMinimalZip, makeZipWithoutIndexHtml } from "./helpers/zip.js";

let app: ReturnType<typeof buildServer>;
let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "orbit-http-"));
  process.env.STORAGE_ROOT = tmpRoot;
  process.env.INTERNAL_HMAC_SECRET = TEST_HMAC_SECRET;
  resetConfigCache();
  app = buildServer();
});

afterEach(async () => {
  resetConfigCache();
  delete process.env.STORAGE_ROOT;
  await rm(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeDeployRequest(
  zipBytes: Uint8Array,
  overrideHeaders: Record<string, string> = {},
): Promise<Request> {
  const form = new FormData();
  form.append("bundle", new Blob([zipBytes], { type: "application/zip" }), "bundle.zip");

  // Materialize multipart bytes so HMAC covers the actual body that Orbit will receive.
  const tmp = new Request("http://localhost/v1/orbit/deploy", { method: "POST", body: form });
  const bodyBytes = new Uint8Array(await tmp.arrayBuffer());
  const contentType = tmp.headers.get("content-type")!;

  const signed = makeSignedHeaders("POST", "/v1/orbit/deploy", bodyBytes);

  return new Request("http://localhost/v1/orbit/deploy", {
    method: "POST",
    body: bodyBytes,
    headers: { "content-type": contentType, ...signed, ...overrideHeaders },
  });
}

async function makeRollbackRequest(
  overrideHeaders: Record<string, string> = {},
): Promise<Request> {
  const bodyBytes = new Uint8Array(0);
  const signed = makeSignedHeaders("POST", "/v1/orbit/rollback", bodyBytes);
  return new Request("http://localhost/v1/orbit/rollback", {
    method: "POST",
    headers: { ...signed, ...overrideHeaders },
  });
}

async function deployOnce(zipBytes?: Uint8Array): Promise<void> {
  const zip = zipBytes ?? (await makeMinimalZip());
  const req = await makeDeployRequest(zip);
  const res = await app.request(req);
  if (!res.ok) throw new Error(`Deploy failed: ${res.status}`);
}

// ---------------------------------------------------------------------------
// Health probes
// ---------------------------------------------------------------------------

describe("GET /healthz", () => {
  it("returns 200 without auth", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});

describe("GET /readyz", () => {
  it("returns 200 when storage is writable", async () => {
    const res = await app.request("/readyz");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// POST /v1/orbit/deploy — auth failures
// ---------------------------------------------------------------------------

describe("POST /v1/orbit/deploy — auth", () => {
  it("returns 401 when HMAC headers are absent", async () => {
    const zip = await makeMinimalZip();
    const form = new FormData();
    form.append("bundle", new Blob([zip], { type: "application/zip" }), "bundle.zip");

    const res = await app.request("/v1/orbit/deploy", { method: "POST", body: form });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: "missing_signature_headers" });
  });

  it("returns 401 when signature is wrong", async () => {
    const zip = await makeMinimalZip();
    const req = await makeDeployRequest(zip, { "x-nuble-sig": "deadbeef".repeat(8) });
    const res = await app.request(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: "bad_signature" });
  });

  it("returns 401 when timestamp is stale", async () => {
    const zip = await makeMinimalZip();
    const staleTs = String(Date.now() - 60_000);
    const req = await makeDeployRequest(zip, { "x-nuble-timestamp": staleTs });
    const res = await app.request(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: "stale_or_invalid_timestamp" });
  });
});

// ---------------------------------------------------------------------------
// POST /v1/orbit/deploy — validation failures
// ---------------------------------------------------------------------------

describe("POST /v1/orbit/deploy — validation", () => {
  it("returns 400 for non-multipart content-type", async () => {
    const bodyBytes = new Uint8Array(4);
    const signed = makeSignedHeaders("POST", "/v1/orbit/deploy", bodyBytes);

    const res = await app.request(
      new Request("http://localhost/v1/orbit/deploy", {
        method: "POST",
        body: bodyBytes,
        headers: { "content-type": "application/octet-stream", ...signed },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "invalid_content_type" });
  });

  it("returns 400 when bundle field is missing from multipart", async () => {
    const form = new FormData();
    form.append("other", "data");

    const tmp = new Request("http://localhost/v1/orbit/deploy", { method: "POST", body: form });
    const bodyBytes = new Uint8Array(await tmp.arrayBuffer());
    const contentType = tmp.headers.get("content-type")!;
    const signed = makeSignedHeaders("POST", "/v1/orbit/deploy", bodyBytes);

    const res = await app.request(
      new Request("http://localhost/v1/orbit/deploy", {
        method: "POST",
        body: bodyBytes,
        headers: { "content-type": contentType, ...signed },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "missing_bundle_field" });
  });

  it("returns 422 for a zip that has no index.html", async () => {
    const zip = await makeZipWithoutIndexHtml();
    const req = await makeDeployRequest(zip);
    const res = await app.request(req);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, error: "missing_index_html" });
  });
});

// ---------------------------------------------------------------------------
// POST /v1/orbit/deploy — success
// ---------------------------------------------------------------------------

describe("POST /v1/orbit/deploy — success", () => {
  it("returns 200 with version and appSlug for a valid bundle", async () => {
    const zip = await makeMinimalZip();
    const req = await makeDeployRequest(zip);
    const res = await app.request(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, appSlug: TEST_APP_SLUG });
    expect(typeof body.version).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// POST /v1/orbit/rollback
// ---------------------------------------------------------------------------

describe("POST /v1/orbit/rollback", () => {
  it("returns 409 when no previous version exists", async () => {
    await deployOnce();
    const req = await makeRollbackRequest();
    const res = await app.request(req);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, error: "no_previous_version" });
  });

  it("returns 200 after two deploys (previous exists)", async () => {
    await deployOnce();
    await deployOnce();
    const req = await makeRollbackRequest();
    const res = await app.request(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/v1/orbit/rollback", { method: "POST" });
    expect(res.status).toBe(401);
  });
});
