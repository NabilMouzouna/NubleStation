import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, VaultError } from "../src/index.js";

const CONFIG = { url: "http://api.test.local", apiKey: "nbl_testid.testsecret" };

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// createClient shape
// ---------------------------------------------------------------------------

describe("createClient", () => {
  it("returns an object with a vault namespace", () => {
    const nuble = createClient(CONFIG);
    expect(nuble).toHaveProperty("vault");
  });

  it("vault has all expected methods", () => {
    const { vault } = createClient(CONFIG);
    expect(typeof vault.upload).toBe("function");
    expect(typeof vault.list).toBe("function");
    expect(typeof vault.download).toBe("function");
    expect(typeof vault.setPublic).toBe("function");
    expect(typeof vault.delete).toBe("function");
  });

  it("two clients with different configs are independent", () => {
    const a = createClient({ url: "http://a.local", apiKey: "nbl_a.a" });
    const b = createClient({ url: "http://b.local", apiKey: "nbl_b.b" });
    expect(a).not.toBe(b);
    expect(a.vault).not.toBe(b.vault);
  });
});

// ---------------------------------------------------------------------------
// vault methods route through correctly
// ---------------------------------------------------------------------------

describe("nuble.vault.list", () => {
  it("sends Authorization header with the configured API key", async () => {
    mockFetch(200, { files: [] });
    const nuble = createClient(CONFIG);
    await nuble.vault.list();
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect((init?.headers as Record<string, string>)?.Authorization).toBe(
      `Bearer ${CONFIG.apiKey}`,
    );
  });

  it("sends request to the configured URL", async () => {
    mockFetch(200, { files: [] });
    const nuble = createClient(CONFIG);
    await nuble.vault.list();
    const [url] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(url).toContain(CONFIG.url);
  });
});

describe("nuble.vault.upload", () => {
  it("returns a FileResult on success", async () => {
    const file = {
      id: "abc", collection: "docs", filename: "test.txt",
      mimeType: "text/plain", sizeBytes: 4, isPublic: false,
      createdAt: new Date().toISOString(),
    };
    mockFetch(201, { file });
    const nuble = createClient(CONFIG);
    const result = await nuble.vault.upload("docs", "test.txt", new Blob(["test"]));
    expect(result).toMatchObject({ id: "abc", collection: "docs" });
  });

  it("throws VaultError on conflict", async () => {
    mockFetch(409, { error: "file_already_exists" });
    const nuble = createClient(CONFIG);
    await expect(
      nuble.vault.upload("docs", "test.txt", new Blob(["x"])),
    ).rejects.toBeInstanceOf(VaultError);
  });
});

// ---------------------------------------------------------------------------
// Re-exported types / errors
// ---------------------------------------------------------------------------

describe("VaultError re-export", () => {
  it("is available directly from @nublestation/client", () => {
    const err = new VaultError(404, "not_found");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.code).toBe("not_found");
  });
});
