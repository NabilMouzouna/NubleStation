import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fileExtension,
  pathExists,
  readFileBytes,
  removeFile,
  resolveFilePath,
  saveFile,
  validateSegment,
} from "../src/services/storage.js";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "vault-storage-"));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// validateSegment
// ---------------------------------------------------------------------------

describe("validateSegment", () => {
  it("accepts simple alphanumeric", () => {
    expect(() => validateSegment("reports", "collection")).not.toThrow();
  });

  it("accepts segment with hyphens and underscores", () => {
    expect(() => validateSegment("patient-records_2026", "collection")).not.toThrow();
  });

  it("accepts filename with extension", () => {
    expect(() => validateSegment("report.pdf", "filename")).not.toThrow();
  });

  it("rejects empty string", () => {
    expect(() => validateSegment("", "collection")).toThrow(
      expect.objectContaining({ code: "invalid_collection" }),
    );
  });

  it("rejects segment with forward slash", () => {
    expect(() => validateSegment("path/traversal", "collection")).toThrow();
  });

  it("rejects double-dot (path traversal)", () => {
    expect(() => validateSegment("..", "collection")).toThrow();
  });

  it("rejects segment containing ..", () => {
    expect(() => validateSegment("foo..bar", "filename")).toThrow();
  });

  it("rejects segment starting with a dot", () => {
    expect(() => validateSegment(".hidden", "filename")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// resolveFilePath
// ---------------------------------------------------------------------------

describe("resolveFilePath", () => {
  it("returns the correct absolute path", () => {
    const result = resolveFilePath(tmpRoot, "my-app", "reports", "q1.pdf");
    expect(result).toBe(join(tmpRoot, "my-app", "reports", "q1.pdf"));
  });

  it("throws invalid_app_slug for path traversal in slug", () => {
    expect(() => resolveFilePath(tmpRoot, "../etc", "col", "file.txt")).toThrow(
      expect.objectContaining({ code: "invalid_app_slug" }),
    );
  });

  it("throws invalid_collection for path traversal in collection", () => {
    expect(() => resolveFilePath(tmpRoot, "app", "../secrets", "file.txt")).toThrow(
      expect.objectContaining({ code: "invalid_collection" }),
    );
  });

  it("throws invalid_filename for path traversal in filename", () => {
    expect(() => resolveFilePath(tmpRoot, "app", "col", "../../etc/passwd")).toThrow(
      expect.objectContaining({ code: "invalid_filename" }),
    );
  });
});

// ---------------------------------------------------------------------------
// saveFile / readFileBytes / removeFile / pathExists
// ---------------------------------------------------------------------------

describe("saveFile", () => {
  it("creates parent directories and writes the file", async () => {
    const filePath = join(tmpRoot, "app", "docs", "readme.txt");
    await saveFile(filePath, new TextEncoder().encode("hello"));
    expect(await pathExists(filePath)).toBe(true);
  });

  it("written bytes are identical to input", async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const filePath = join(tmpRoot, "app", "bin", "data.bin");
    await saveFile(filePath, data);
    const read = await readFileBytes(filePath);
    expect(Array.from(new Uint8Array(read))).toEqual([1, 2, 3, 4, 5]);
  });

  it("overwrites an existing file", async () => {
    const filePath = join(tmpRoot, "f.txt");
    await saveFile(filePath, new TextEncoder().encode("v1"));
    await saveFile(filePath, new TextEncoder().encode("v2"));
    const content = await readFileBytes(filePath);
    expect(new TextDecoder().decode(content)).toBe("v2");
  });
});

describe("removeFile", () => {
  it("deletes an existing file", async () => {
    const filePath = join(tmpRoot, "todelete.txt");
    await saveFile(filePath, new TextEncoder().encode("bye"));
    await removeFile(filePath);
    expect(await pathExists(filePath)).toBe(false);
  });

  it("throws when file does not exist", async () => {
    await expect(removeFile(join(tmpRoot, "ghost.txt"))).rejects.toThrow();
  });
});

describe("pathExists", () => {
  it("returns true for an existing file", async () => {
    const filePath = join(tmpRoot, "exists.txt");
    await saveFile(filePath, new Uint8Array([0]));
    expect(await pathExists(filePath)).toBe(true);
  });

  it("returns false for a missing path", async () => {
    expect(await pathExists(join(tmpRoot, "missing.txt"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fileExtension
// ---------------------------------------------------------------------------

describe("fileExtension", () => {
  it("returns lowercase extension", () => {
    expect(fileExtension("Report.PDF")).toBe("pdf");
  });

  it("returns last extension for multi-dot filename", () => {
    expect(fileExtension("archive.tar.gz")).toBe("gz");
  });

  it("returns empty string for filename with no extension", () => {
    expect(fileExtension("Makefile")).toBe("");
  });

  it("returns empty string for dotfile", () => {
    expect(fileExtension(".gitignore")).toBe("");
  });
});
