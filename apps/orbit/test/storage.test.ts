import { access, constants, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  atomicDeploy,
  resolveAppDir,
  rollback,
  validateSlug,
} from "../src/services/storage.js";
import { makeMinimalZip, makeZipWithoutIndexHtml } from "./helpers/zip.js";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "orbit-storage-"));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// validateSlug
// ---------------------------------------------------------------------------

describe("validateSlug", () => {
  it("accepts a single lowercase letter", () => {
    expect(() => validateSlug("a")).not.toThrow();
  });

  it("accepts alphanumeric slug", () => {
    expect(() => validateSlug("myapp123")).not.toThrow();
  });

  it("accepts slug with internal hyphens", () => {
    expect(() => validateSlug("my-app")).not.toThrow();
  });

  it("rejects empty string", () => {
    expect(() => validateSlug("")).toThrow();
  });

  it("rejects slug starting with hyphen", () => {
    expect(() => validateSlug("-app")).toThrow();
  });

  it("rejects slug ending with hyphen", () => {
    expect(() => validateSlug("app-")).toThrow();
  });

  it("rejects uppercase letters", () => {
    expect(() => validateSlug("MyApp")).toThrow();
  });

  it("rejects slug with path separator", () => {
    expect(() => validateSlug("my/app")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// resolveAppDir
// ---------------------------------------------------------------------------

describe("resolveAppDir", () => {
  it("returns storageRoot/slug for a valid slug", () => {
    const result = resolveAppDir(tmpRoot, "tasks");
    expect(result).toBe(join(tmpRoot, "tasks"));
  });

  it("throws invalid_slug for path traversal with ../", () => {
    expect(() => resolveAppDir(tmpRoot, "../etc")).toThrow(
      expect.objectContaining({ code: "invalid_slug" }),
    );
  });

  it("throws invalid_slug for slug with dot-dot component", () => {
    expect(() => resolveAppDir(tmpRoot, "..")).toThrow(
      expect.objectContaining({ code: "invalid_slug" }),
    );
  });
});

// ---------------------------------------------------------------------------
// atomicDeploy
// ---------------------------------------------------------------------------

describe("atomicDeploy", () => {
  it("creates current/ and extracts index.html", async () => {
    const zip = await makeMinimalZip();
    await atomicDeploy(tmpRoot, "app", zip);

    await expect(
      access(join(tmpRoot, "app", "current", "index.html"), constants.F_OK),
    ).resolves.toBeUndefined();
  });

  it("returns a version string (timestamp)", async () => {
    const zip = await makeMinimalZip();
    const version = await atomicDeploy(tmpRoot, "app", zip);
    expect(typeof version).toBe("string");
    expect(Number(version)).toBeGreaterThan(0);
  });

  it("promotes previous current/ to .previous/ on second deploy", async () => {
    const zip = await makeMinimalZip();
    await atomicDeploy(tmpRoot, "app", zip);
    await atomicDeploy(tmpRoot, "app", zip);

    await expect(
      access(join(tmpRoot, "app", ".previous"), constants.F_OK),
    ).resolves.toBeUndefined();
  });

  it("cleans up temp zip and incoming dir on success", async () => {
    const zip = await makeMinimalZip();
    await atomicDeploy(tmpRoot, "app", zip);

    const entries = await readdir(join(tmpRoot, "app"));
    const hasTempFiles = entries.some(
      (e) => e.startsWith(".incoming-"),
    );
    expect(hasTempFiles).toBe(false);
  });

  it("rejects zip without index.html with code missing_index_html", async () => {
    const zip = await makeZipWithoutIndexHtml();
    await expect(atomicDeploy(tmpRoot, "app", zip)).rejects.toMatchObject({
      code: "missing_index_html",
    });
  });

  it("cleans up temp files when zip is missing index.html", async () => {
    const zip = await makeZipWithoutIndexHtml();
    await expect(atomicDeploy(tmpRoot, "app", zip)).rejects.toMatchObject({
      code: "missing_index_html",
    });

    const entries = await readdir(join(tmpRoot, "app"));
    const hasTempFiles = entries.some((e) => e.startsWith(".incoming-"));
    expect(hasTempFiles).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// rollback
// ---------------------------------------------------------------------------

describe("rollback", () => {
  it("throws no_previous_version when .previous/ is absent", async () => {
    const zip = await makeMinimalZip();
    await atomicDeploy(tmpRoot, "app", zip);

    await expect(rollback(tmpRoot, "app")).rejects.toMatchObject({
      code: "no_previous_version",
    });
  });

  it("swaps current and .previous after two deploys", async () => {
    const zipA = await makeZipBuffer({ "index.html": "<h1>v1</h1>" });
    const zipB = await makeZipBuffer({ "index.html": "<h1>v2</h1>" });

    await atomicDeploy(tmpRoot, "app", zipA);
    await atomicDeploy(tmpRoot, "app", zipB);

    // current has v2; .previous has v1
    await rollback(tmpRoot, "app");

    // after rollback, current should have v1 content
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(tmpRoot, "app", "current", "index.html"), "utf8");
    expect(content).toBe("<h1>v1</h1>");
  });

  it("leaves no .previous/ after rollback", async () => {
    const zip = await makeMinimalZip();
    await atomicDeploy(tmpRoot, "app", zip);
    await atomicDeploy(tmpRoot, "app", zip);
    await rollback(tmpRoot, "app");

    await expect(
      access(join(tmpRoot, "app", ".previous"), constants.F_OK),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// helpers import for multi-file zip
// ---------------------------------------------------------------------------

async function makeZipBuffer(files: Record<string, string>): Promise<Uint8Array> {
  const { makeZipBuffer: make } = await import("./helpers/zip.js");
  return make(files);
}
