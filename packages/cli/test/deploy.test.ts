import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zipDirectory } from "../src/utils/zip.js";
import { uploadBundle, checkGatewayHealth } from "../src/utils/upload.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "nuble-cli-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// zipDirectory
// ---------------------------------------------------------------------------

describe("zipDirectory", () => {
  it("throws when path is not a directory", async () => {
    await expect(zipDirectory(join(tmpDir, "nonexistent"))).rejects.toThrow();
  });

  it("throws when path is a file, not a directory", async () => {
    const filePath = join(tmpDir, "file.txt");
    await writeFile(filePath, "hello");
    await expect(zipDirectory(filePath)).rejects.toThrow("not a directory");
  });

  it("returns a Buffer containing a valid zip", async () => {
    const distDir = join(tmpDir, "dist");
    await mkdir(distDir);
    await writeFile(join(distDir, "index.html"), "<h1>test</h1>");
    await writeFile(join(distDir, "app.js"), "console.log(1)");

    const buf = await zipDirectory(distDir);
    expect(buf).toBeInstanceOf(Buffer);
    // ZIP files start with the PK magic bytes 0x50 0x4B
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it("zip content is non-empty for a dist with files", async () => {
    const distDir = join(tmpDir, "dist");
    await mkdir(distDir);
    await writeFile(join(distDir, "index.html"), "<h1>hi</h1>");

    const buf = await zipDirectory(distDir);
    expect(buf.length).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------
// uploadBundle (mocked fetch)
// ---------------------------------------------------------------------------

describe("uploadBundle", () => {
  it("calls the correct endpoint with Authorization header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true, version: "12345", appSlug: "tasks" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const buf = Buffer.from("zip-bytes");
    const result = await uploadBundle("http://api.nuble.local", "nbl_k.secret", buf);

    expect(result.ok).toBe(true);
    expect(result.version).toBe("12345");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("http://api.nuble.local/v1/orbit/deploy");
    expect(init.headers["Authorization"]).toBe("Bearer nbl_k.secret");
    expect(init.method).toBe("POST");
  });

  it("returns the error from the response when deploy fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: false, error: "missing_index_html" }),
    }));

    const result = await uploadBundle("http://api.nuble.local", "nbl_k.s", Buffer.from("zip"));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("missing_index_html");
  });
});

// ---------------------------------------------------------------------------
// checkGatewayHealth (mocked fetch)
// ---------------------------------------------------------------------------

describe("checkGatewayHealth", () => {
  it("returns reachable:true on HTTP 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const result = await checkGatewayHealth("http://api.nuble.local");
    expect(result.reachable).toBe(true);
    expect(result.status).toBe(200);
  });

  it("returns reachable:false when fetch throws (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const result = await checkGatewayHealth("http://api.nuble.local");
    expect(result.reachable).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("returns reachable:false on HTTP 503", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const result = await checkGatewayHealth("http://api.nuble.local");
    expect(result.reachable).toBe(false);
    expect(result.status).toBe(503);
  });
});
