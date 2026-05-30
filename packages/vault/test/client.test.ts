import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VaultError, createVaultClient } from "../src/index.js";

const CONFIG = { url: "http://api.test.local", apiKey: "nbl_testid.testsecret" };
const client = createVaultClient(CONFIG);

const FAKE_FILE = {
  id: "aaa-111",
  collection: "docs",
  filename: "report.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024,
  isPublic: false,
  createdAt: "2026-05-30T00:00:00Z",
};

function mockFetch(status: number, body: unknown, extraHeaders?: Record<string, string>) {
  const r = new Response(
    body instanceof ArrayBuffer ? body : JSON.stringify(body),
    { status, headers: { "content-type": "application/json", ...extraHeaders } },
  );
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(r));
}

function capturedFetch() {
  return vi.mocked(globalThis.fetch);
}

afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// Authorization header
// ---------------------------------------------------------------------------

describe("Authorization header", () => {
  it("attaches Bearer token to every request", async () => {
    mockFetch(200, { files: [] });
    await client.list();
    const [, init] = capturedFetch().mock.calls[0]!;
    expect((init?.headers as Record<string, string>)?.Authorization).toBe(
      `Bearer ${CONFIG.apiKey}`,
    );
  });
});

// ---------------------------------------------------------------------------
// upload
// ---------------------------------------------------------------------------

describe("upload", () => {
  it("sends POST to /v1/vault/files/:collection/:filename", async () => {
    mockFetch(201, { file: FAKE_FILE });
    await client.upload("docs", "report.pdf", new Uint8Array([1, 2, 3]));
    const [url, init] = capturedFetch().mock.calls[0]!;
    expect(url).toBe("http://api.test.local/v1/vault/files/docs/report.pdf");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it("returns the FileResult from the response", async () => {
    mockFetch(201, { file: FAKE_FILE });
    const result = await client.upload("docs", "report.pdf", new Blob(["hello"]));
    expect(result).toMatchObject({ id: "aaa-111", collection: "docs", filename: "report.pdf" });
  });

  it("wraps Uint8Array in a Blob before appending to FormData", async () => {
    mockFetch(201, { file: FAKE_FILE });
    await client.upload("docs", "data.bin", new Uint8Array([9, 8, 7]));
    const form = capturedFetch().mock.calls[0]![1]?.body as FormData;
    const entry = form.get("file");
    expect(entry).toBeInstanceOf(Blob);
  });

  it("throws VaultError(409) on conflict", async () => {
    mockFetch(409, { error: "file_already_exists" });
    await expect(
      client.upload("docs", "report.pdf", new Blob(["x"])),
    ).rejects.toMatchObject({ status: 409, code: "file_already_exists" });
  });

  it("throws VaultError(415) when extension not allowed", async () => {
    mockFetch(415, { error: "extension_not_allowed" });
    await expect(
      client.upload("docs", "script.sh", new Blob(["x"])),
    ).rejects.toMatchObject({ status: 415, code: "extension_not_allowed" });
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("list", () => {
  it("GET /v1/vault/files with no collection", async () => {
    mockFetch(200, { files: [FAKE_FILE] });
    const files = await client.list();
    const [url] = capturedFetch().mock.calls[0]!;
    expect(url).toBe("http://api.test.local/v1/vault/files");
    expect(files).toHaveLength(1);
  });

  it("GET /v1/vault/files/:collection when collection is provided", async () => {
    mockFetch(200, { files: [FAKE_FILE] });
    await client.list("docs");
    const [url] = capturedFetch().mock.calls[0]!;
    expect(url).toBe("http://api.test.local/v1/vault/files/docs");
  });

  it("returns empty array when no files", async () => {
    mockFetch(200, { files: [] });
    expect(await client.list()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// download
// ---------------------------------------------------------------------------

describe("download", () => {
  it("GET /v1/vault/files/:collection/:filename", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const r = new Response(bytes, { status: 200, headers: { "content-type": "application/pdf" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(r));
    const result = await client.download("docs", "report.pdf");
    expect(result).toBeInstanceOf(ArrayBuffer);
    const [url, init] = capturedFetch().mock.calls[0]!;
    expect(url).toBe("http://api.test.local/v1/vault/files/docs/report.pdf");
    expect(init?.method).toBe("GET");
  });

  it("throws VaultError(404) when file not found", async () => {
    mockFetch(404, { error: "not_found" });
    await expect(client.download("docs", "ghost.pdf")).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
  });
});

// ---------------------------------------------------------------------------
// setPublic
// ---------------------------------------------------------------------------

describe("setPublic", () => {
  it("PATCH with { isPublic: true } and content-type json", async () => {
    mockFetch(200, { file: { ...FAKE_FILE, is_public: true } });
    await client.setPublic("docs", "report.pdf", true);
    const [url, init] = capturedFetch().mock.calls[0]!;
    expect(url).toBe("http://api.test.local/v1/vault/files/docs/report.pdf");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ isPublic: true }));
    expect((init?.headers as Record<string, string>)?.["content-type"]).toBe("application/json");
  });

  it("throws VaultError(404) when file not found", async () => {
    mockFetch(404, { error: "not_found" });
    await expect(client.setPublic("docs", "ghost.pdf", true)).rejects.toMatchObject({
      status: 404,
    });
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe("delete", () => {
  it("sends DELETE to the correct path", async () => {
    mockFetch(200, { ok: true });
    await client.delete("docs", "report.pdf");
    const [url, init] = capturedFetch().mock.calls[0]!;
    expect(url).toBe("http://api.test.local/v1/vault/files/docs/report.pdf");
    expect(init?.method).toBe("DELETE");
  });

  it("resolves void on success", async () => {
    mockFetch(200, { ok: true });
    await expect(client.delete("docs", "report.pdf")).resolves.toBeUndefined();
  });

  it("throws VaultError(404) when file not found", async () => {
    mockFetch(404, { error: "not_found" });
    await expect(client.delete("docs", "ghost.pdf")).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// VaultError
// ---------------------------------------------------------------------------

describe("VaultError", () => {
  it("is instanceof Error", () => {
    expect(new VaultError(500, "boom")).toBeInstanceOf(Error);
  });

  it("exposes status and code", () => {
    const e = new VaultError(422, "missing_index");
    expect(e.status).toBe(422);
    expect(e.code).toBe("missing_index");
    expect(e.name).toBe("VaultError");
  });
});
