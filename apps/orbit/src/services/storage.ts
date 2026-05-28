import { createReadStream } from "node:fs";
import { access, constants, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import unzipper from "unzipper";

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export function validateSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw Object.assign(new Error("invalid_slug"), { code: "invalid_slug" });
  }
}

export function resolveAppDir(storageRoot: string, orgDomain: string, slug: string): string {
  validateSlug(orgDomain);
  validateSlug(slug);
  const orgDir  = resolve(storageRoot, orgDomain);
  const safe    = resolve(orgDir, slug);
  // Guard against path traversal even after slug validation.
  if (!safe.startsWith(orgDir + "/") && safe !== orgDir) {
    throw Object.assign(new Error("invalid_slug"), { code: "invalid_slug" });
  }
  return safe;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  await new Promise<void>((res, rej) => {
    createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: destDir }))
      .on("close", res)
      .on("error", rej);
  });
}

/**
 * Atomically deploys `zipBuffer` for `slug`:
 *   1. Write zip to .incoming-{ts}.zip
 *   2. Extract to .incoming-{ts}/
 *   3. Validate index.html exists at root
 *   4. Swap: rm .previous, mv current → .previous, mv .incoming → current
 *   5. Delete zip
 *
 * Returns the deployment version (timestamp string).
 */
export async function atomicDeploy(
  storageRoot: string,
  orgDomain: string,
  slug: string,
  zipBuffer: Uint8Array,
): Promise<string> {
  const appDir = resolveAppDir(storageRoot, orgDomain, slug);
  await mkdir(appDir, { recursive: true });

  const ts = Date.now().toString();
  const incomingZip = join(appDir, `.incoming-${ts}.zip`);
  const incomingDir = join(appDir, `.incoming-${ts}`);
  const currentDir = join(appDir, "current");
  const previousDir = join(appDir, ".previous");

  try {
    await writeFile(incomingZip, zipBuffer);
    await extractZip(incomingZip, incomingDir);

    // Validate the bundle has an entry point.
    const indexPath = join(incomingDir, "index.html");
    try {
      await access(indexPath, constants.F_OK);
    } catch {
      throw Object.assign(new Error("missing_index_html"), { code: "missing_index_html" });
    }

    // Atomic swap.
    if (await pathExists(previousDir)) {
      await rm(previousDir, { recursive: true, force: true });
    }
    if (await pathExists(currentDir)) {
      await rename(currentDir, previousDir);
    }
    await rename(incomingDir, currentDir);

    return ts;
  } finally {
    // Best-effort cleanup of the zip and any failed incoming dir.
    if (await pathExists(incomingZip)) {
      await rm(incomingZip, { force: true }).catch(() => undefined);
    }
    if (await pathExists(incomingDir)) {
      await rm(incomingDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/**
 * Swaps current ↔ .previous for `slug`.
 * Throws with code "no_previous_version" if .previous does not exist.
 */
export async function rollback(storageRoot: string, orgDomain: string, slug: string): Promise<void> {
  const appDir = resolveAppDir(storageRoot, orgDomain, slug);
  const currentDir = join(appDir, "current");
  const previousDir = join(appDir, ".previous");

  if (!(await pathExists(previousDir))) {
    throw Object.assign(new Error("no_previous_version"), { code: "no_previous_version" });
  }

  const oldDir = join(appDir, `.old-${Date.now()}`);
  if (await pathExists(currentDir)) {
    await rename(currentDir, oldDir);
  }
  await rename(previousDir, currentDir);
  if (await pathExists(oldDir)) {
    await rm(oldDir, { recursive: true, force: true });
  }
}
