import { constants, createReadStream } from "node:fs";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// Segments: alphanumeric, hyphens, underscores, dots — no slash, no consecutive dots.
const SEGMENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function validateSegment(s: string, label: string): void {
  if (!s || !SEGMENT_RE.test(s) || s.includes("..")) {
    throw Object.assign(new Error(`invalid_${label}`), { code: `invalid_${label}` });
  }
}

/**
 * Resolves the absolute path for a file and guards against path traversal.
 * storageRoot / appSlug / collection / filename
 */
export function resolveFilePath(
  storageRoot: string,
  appSlug: string,
  collection: string,
  filename: string,
): string {
  validateSegment(appSlug, "app_slug");
  validateSegment(collection, "collection");
  validateSegment(filename, "filename");

  const safe = resolve(storageRoot, appSlug, collection, filename);
  const root = resolve(storageRoot);

  if (!safe.startsWith(root + "/") && safe !== root) {
    throw Object.assign(new Error("invalid_path"), { code: "invalid_path" });
  }
  return safe;
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function saveFile(filePath: string, data: Uint8Array): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, data);
}

export async function readFileBytes(filePath: string): Promise<ArrayBuffer> {
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(filePath);
  const ab  = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return ab;
}

export function fileReadStream(filePath: string) {
  return createReadStream(filePath);
}

export async function removeFile(filePath: string): Promise<void> {
  await unlink(filePath);
}

export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}
