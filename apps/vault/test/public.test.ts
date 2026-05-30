import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigCache } from "../src/config.js";
import { buildServer } from "../src/server.js";
import { TEST_APP_ID } from "./helpers/sign.js";

vi.mock("../src/db/pool.js", () => ({ getPool: vi.fn() }));

import { getPool } from "../src/db/pool.js";

function mockQuery(rows: unknown[], rowCount?: number) {
  vi.mocked(getPool).mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows, rowCount: rowCount ?? rows.length }),
  } as never);
}

let app: ReturnType<typeof buildServer>;
let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "vault-pub-"));
  process.env.STORAGE_ROOT         = tmpRoot;
  process.env.INTERNAL_HMAC_SECRET = "test-secret-vault-min32chars!!!!!";
  resetConfigCache();
  app = buildServer();
});

afterEach(async () => {
  resetConfigCache();
  vi.clearAllMocks();
  delete process.env.STORAGE_ROOT;
  await rm(tmpRoot, { recursive: true, force: true });
});

const PATH = "/vault/test-app/docs/hello.txt";

describe("GET /vault/:appSlug/:collection/:filename", () => {
  it("returns 404 when file is not found in DB", async () => {
    mockQuery([]);
    const res = await app.request(PATH);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, error: "not_found" });
  });

  it("returns 403 when file exists but is_public is false", async () => {
    mockQuery([{
      id: "aaa", app_id: TEST_APP_ID, collection: "docs", filename: "hello.txt",
      storage_path: join(tmpRoot, "hello.txt"), mime_type: "text/plain",
      size_bytes: 5, is_public: false, created_at: new Date().toISOString(),
    }]);
    const res = await app.request(PATH);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("returns 200 with file bytes when file is public", async () => {
    const { saveFile } = await import("../src/services/storage.js");
    const filePath = join(tmpRoot, "public-hello.txt");
    await saveFile(filePath, new TextEncoder().encode("public content"));

    mockQuery([{
      id: "aaa", app_id: TEST_APP_ID, collection: "docs", filename: "hello.txt",
      storage_path: filePath, mime_type: "text/plain",
      size_bytes: 14, is_public: true, created_at: new Date().toISOString(),
    }]);

    const res = await app.request(PATH);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(await res.text()).toBe("public content");
  });

  it("includes cache-control header for public files", async () => {
    const { saveFile } = await import("../src/services/storage.js");
    const filePath = join(tmpRoot, "cached.txt");
    await saveFile(filePath, new TextEncoder().encode("cached"));

    mockQuery([{
      id: "bbb", app_id: TEST_APP_ID, collection: "docs", filename: "hello.txt",
      storage_path: filePath, mime_type: "text/plain",
      size_bytes: 6, is_public: true, created_at: new Date().toISOString(),
    }]);

    const res = await app.request(PATH);
    expect(res.headers.get("cache-control")).toMatch(/public/);
  });

  it("does not require an Authorization header", async () => {
    mockQuery([]);
    const res = await app.request(PATH, {
      headers: {}, // no Authorization header at all
    });
    // 404 is fine — point is it didn't return 401
    expect(res.status).not.toBe(401);
  });
});
