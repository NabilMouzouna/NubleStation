import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigCache } from "../src/config.js";
import { buildServer } from "../src/server.js";
import { TEST_APP_ID, TEST_HMAC_SECRET, makeSignedHeaders } from "./helpers/sign.js";
import { makeFileUploadRequest } from "./helpers/multipart.js";

// ---------------------------------------------------------------------------
// Mock the DB pool — routes must not hit a real database.
// ---------------------------------------------------------------------------

vi.mock("../src/db/pool.js", () => ({ getPool: vi.fn() }));

import { getPool } from "../src/db/pool.js";

function mockPool(responses: Array<{ rows: unknown[]; rowCount?: number }>) {
  let call = 0;
  const query = vi.fn().mockImplementation(() => {
    const r = responses[call++] ?? { rows: [], rowCount: 0 };
    return Promise.resolve({ rows: r.rows, rowCount: r.rowCount ?? r.rows.length });
  });
  vi.mocked(getPool).mockReturnValue({ query } as never);
  return query;
}

const FAKE_FILE_ROW = {
  id:           "aaaaaaaa-0000-0000-0000-000000000001",
  app_id:       TEST_APP_ID,
  owner_id:     null, // communal — resolveFileAccess grants full access (ADR 016)
  collection:   "docs",
  filename:     "hello.txt",
  storage_path: "", // filled per-test
  mime_type:    "text/plain",
  size_bytes:   5,
  is_public:    false,
  created_at:   new Date().toISOString(),
};

const DEFAULT_SETTINGS = { rows: [{ allowed_extensions: [], max_file_bytes: 52_428_800 }] };

// resolveCaller() with no matching users row → { userId: null, isAdmin: false },
// i.e. a communal/anonymous caller. Combined with owner_id=null files above,
// access checks resolve to "owner" (the pre-ADR-016 full-access behaviour).
const CALLER_COMMUNAL = { rows: [] as unknown[] };

let app: ReturnType<typeof buildServer>;
let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "vault-http-"));
  process.env.STORAGE_ROOT        = tmpRoot;
  process.env.INTERNAL_HMAC_SECRET = TEST_HMAC_SECRET;
  resetConfigCache();
  app = buildServer();
});

afterEach(async () => {
  resetConfigCache();
  vi.clearAllMocks();
  delete process.env.STORAGE_ROOT;
  await rm(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

describe("GET /healthz", () => {
  it("returns 200 without auth", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// POST /v1/vault/files/:collection/:filename — auth failures
// ---------------------------------------------------------------------------

describe("POST /v1/vault/files/docs/hello.txt — auth", () => {
  const path = "/v1/vault/files/docs/hello.txt";

  it("returns 401 when HMAC headers are absent", async () => {
    const res = await app.request(path, { method: "POST" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: "missing_signature_headers" });
  });

  it("returns 401 when signature is wrong", async () => {
    const { bodyBytes, contentType } = await makeFileUploadRequest("hi");
    const signed = makeSignedHeaders("POST", path, bodyBytes);
    const res = await app.request(
      new Request(`http://localhost${path}`, {
        method: "POST",
        body: new Blob([bodyBytes]),
        headers: { "content-type": contentType, ...signed, "x-nuble-sig": "badbadbadbad" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when timestamp is stale", async () => {
    const { bodyBytes, contentType } = await makeFileUploadRequest("hi");
    const signed = makeSignedHeaders("POST", path, bodyBytes);
    const res = await app.request(
      new Request(`http://localhost${path}`, {
        method: "POST",
        body: new Blob([bodyBytes]),
        headers: {
          "content-type": contentType,
          ...signed,
          "x-nuble-timestamp": String(Date.now() - 60_000),
        },
      }),
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/vault/files/:collection/:filename — validation
// ---------------------------------------------------------------------------

describe("POST /v1/vault/files/docs/hello.txt — validation", () => {
  const path = "/v1/vault/files/docs/hello.txt";

  it("returns 400 for non-multipart content-type", async () => {
    const body   = Buffer.from("raw");
    const signed = makeSignedHeaders("POST", path, body);
    const res = await app.request(
      new Request(`http://localhost${path}`, {
        method:  "POST",
        body,
        headers: { "content-type": "application/octet-stream", ...signed },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "invalid_content_type" });
  });

  it("returns 400 when file field is missing from multipart", async () => {
    const form = new FormData();
    form.append("other", "data");
    const tmp  = new Request("http://localhost/up", { method: "POST", body: form });
    const ab          = await tmp.arrayBuffer();
    const bodyBytes   = new Uint8Array(ab);
    const contentType = tmp.headers.get("content-type")!;
    const signed = makeSignedHeaders("POST", path, bodyBytes);
    mockPool([DEFAULT_SETTINGS, { rows: [], rowCount: 0 }]);
    const res = await app.request(
      new Request(`http://localhost${path}`, {
        method: "POST",
        body: new Blob([bodyBytes]),
        headers: { "content-type": contentType, ...signed },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "missing_file_field" });
  });

  it("returns 415 when extension is not in allowed list", async () => {
    const { bodyBytes, contentType } = await makeFileUploadRequest("data", "script.sh", "text/x-sh");
    const signed = makeSignedHeaders("POST", path, bodyBytes);
    mockPool([CALLER_COMMUNAL, { rows: [{ allowed_extensions: ["pdf", "jpg"], max_file_bytes: 52_428_800 }] }]);
    const res = await app.request(
      new Request(`http://localhost${path}`, {
        method: "POST",
        body: new Blob([bodyBytes]),
        headers: { "content-type": contentType, ...signed },
      }),
    );
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ ok: false, error: "extension_not_allowed" });
  });

  it("returns 409 when file already exists", async () => {
    const { bodyBytes, contentType } = await makeFileUploadRequest("hello");
    const signed = makeSignedHeaders("POST", path, bodyBytes);
    // caller → settings → conflict check returns a file owned by someone else
    mockPool([
      CALLER_COMMUNAL,
      DEFAULT_SETTINGS,
      { rows: [{ ...FAKE_FILE_ROW, owner_id: "ffffffff-0000-0000-0000-000000000099" }], rowCount: 1 },
    ]);
    const res = await app.request(
      new Request(`http://localhost${path}`, {
        method: "POST",
        body: new Blob([bodyBytes]),
        headers: { "content-type": contentType, ...signed },
      }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, error: "file_already_exists" });
  });
});

// ---------------------------------------------------------------------------
// POST /v1/vault/files/:collection/:filename — success
// ---------------------------------------------------------------------------

describe("POST /v1/vault/files/docs/hello.txt — success", () => {
  const path = "/v1/vault/files/docs/hello.txt";

  it("returns 201 with file metadata", async () => {
    const { bodyBytes, contentType } = await makeFileUploadRequest("hello", "hello.txt", "text/plain");
    const signed = makeSignedHeaders("POST", path, bodyBytes);
    const fileRow = { ...FAKE_FILE_ROW, storage_path: join(tmpRoot, "test-app", "docs", "hello.txt") };
    // caller → settings → no conflict → insert
    mockPool([CALLER_COMMUNAL, DEFAULT_SETTINGS, { rows: [], rowCount: 0 }, { rows: [fileRow] }]);
    const res = await app.request(
      new Request(`http://localhost${path}`, {
        method: "POST",
        body: new Blob([bodyBytes]),
        headers: { "content-type": contentType, "x-nuble-app-slug": "test-app", ...signed },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, file: { collection: "docs", filename: "hello.txt" } });
  });
});

// ---------------------------------------------------------------------------
// GET /v1/vault/files
// ---------------------------------------------------------------------------

describe("GET /v1/vault/files", () => {
  const path = "/v1/vault/files";

  it("returns 401 without auth", async () => {
    const res = await app.request(path);
    expect(res.status).toBe(401);
  });

  it("returns 200 with file list", async () => {
    const signed = makeSignedHeaders("GET", path, new Uint8Array());
    mockPool([CALLER_COMMUNAL, { rows: [FAKE_FILE_ROW, { ...FAKE_FILE_ROW, id: "bbb" }] }]);
    const res = await app.request(
      new Request(`http://localhost${path}`, { headers: signed }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.files).toHaveLength(2);
  });

  it("returns 200 with empty list when no files", async () => {
    const signed = makeSignedHeaders("GET", path, new Uint8Array());
    mockPool([CALLER_COMMUNAL, { rows: [] }]);
    const res = await app.request(
      new Request(`http://localhost${path}`, { headers: signed }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).files).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/vault/files/:collection
// ---------------------------------------------------------------------------

describe("GET /v1/vault/files/docs", () => {
  const path = "/v1/vault/files/docs";

  it("returns 200 with collection-filtered list", async () => {
    const signed = makeSignedHeaders("GET", path, new Uint8Array());
    mockPool([CALLER_COMMUNAL, { rows: [FAKE_FILE_ROW] }]);
    const res = await app.request(
      new Request(`http://localhost${path}`, { headers: signed }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).files[0].collection).toBe("docs");
  });
});

// ---------------------------------------------------------------------------
// GET /v1/vault/files/:collection/:filename
// ---------------------------------------------------------------------------

describe("GET /v1/vault/files/docs/hello.txt — download", () => {
  const path = "/v1/vault/files/docs/hello.txt";

  it("returns 401 without auth", async () => {
    const res = await app.request(path);
    expect(res.status).toBe(401);
  });

  it("returns 404 when file not in DB", async () => {
    const signed = makeSignedHeaders("GET", path, new Uint8Array());
    mockPool([{ rows: [] }]);
    const res = await app.request(
      new Request(`http://localhost${path}`, { headers: signed }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with file bytes and correct content-type", async () => {
    // Write a real file to tmpRoot so the handler can read it
    const { saveFile } = await import("../src/services/storage.js");
    const filePath = join(tmpRoot, "test-app", "docs", "hello.txt");
    await saveFile(filePath, new TextEncoder().encode("world"));

    const signed   = makeSignedHeaders("GET", path, new Uint8Array());
    const fileRow  = { ...FAKE_FILE_ROW, storage_path: filePath };
    mockPool([{ rows: [fileRow] }, CALLER_COMMUNAL]);

    const res = await app.request(
      new Request(`http://localhost${path}`, { headers: { "x-nuble-app-slug": "test-app", ...signed } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(await res.text()).toBe("world");
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/vault/files/:collection/:filename
// ---------------------------------------------------------------------------

describe("PATCH /v1/vault/files/docs/hello.txt", () => {
  const path = "/v1/vault/files/docs/hello.txt";

  it("returns 400 for invalid JSON body", async () => {
    const body   = new TextEncoder().encode("not-json");
    const signed = makeSignedHeaders("PATCH", path, body);
    const res = await app.request(
      new Request(`http://localhost${path}`, {
        method: "PATCH",
        body,
        headers: { "content-type": "application/json", ...signed },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when isPublic is missing from body", async () => {
    const body   = new TextEncoder().encode(JSON.stringify({ wrong: true }));
    const signed = makeSignedHeaders("PATCH", path, body);
    mockPool([]);
    const res = await app.request(
      new Request(`http://localhost${path}`, {
        method: "PATCH",
        body,
        headers: { "content-type": "application/json", ...signed },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when file does not exist", async () => {
    const body   = new TextEncoder().encode(JSON.stringify({ isPublic: true }));
    const signed = makeSignedHeaders("PATCH", path, body);
    mockPool([{ rows: [], rowCount: 0 }]);
    const res = await app.request(
      new Request(`http://localhost${path}`, {
        method: "PATCH",
        body,
        headers: { "content-type": "application/json", ...signed },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with updated file on success", async () => {
    const body   = new TextEncoder().encode(JSON.stringify({ isPublic: true }));
    const signed = makeSignedHeaders("PATCH", path, body);
    // getFile → caller → setPublic
    mockPool([{ rows: [FAKE_FILE_ROW] }, CALLER_COMMUNAL, { rows: [{ ...FAKE_FILE_ROW, is_public: true }] }]);
    const res = await app.request(
      new Request(`http://localhost${path}`, {
        method: "PATCH",
        body,
        headers: { "content-type": "application/json", ...signed },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).file.isPublic).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/vault/files/:collection/:filename
// ---------------------------------------------------------------------------

describe("DELETE /v1/vault/files/docs/hello.txt", () => {
  const path = "/v1/vault/files/docs/hello.txt";

  it("returns 401 without auth", async () => {
    const res = await app.request(path, { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("returns 404 when file does not exist in DB", async () => {
    const body   = Buffer.alloc(0);
    const signed = makeSignedHeaders("DELETE", path, body);
    mockPool([{ rows: [], rowCount: 0 }]);
    const res = await app.request(
      new Request(`http://localhost${path}`, { method: "DELETE", headers: signed }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 and removes the file from disk", async () => {
    const { saveFile } = await import("../src/services/storage.js");
    const filePath = join(tmpRoot, "test-app", "docs", "hello.txt");
    await saveFile(filePath, new TextEncoder().encode("bye"));

    const body   = Buffer.alloc(0);
    const signed = makeSignedHeaders("DELETE", path, body);
    // getFile → caller → deleteFileMeta
    const delRow = { rows: [{ ...FAKE_FILE_ROW, storage_path: filePath }] };
    mockPool([delRow, CALLER_COMMUNAL, delRow]);

    const res = await app.request(
      new Request(`http://localhost${path}`, {
        method:  "DELETE",
        headers: { "x-nuble-app-slug": "test-app", ...signed },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });

    const { pathExists } = await import("../src/services/storage.js");
    expect(await pathExists(filePath)).toBe(false);
  });
});
