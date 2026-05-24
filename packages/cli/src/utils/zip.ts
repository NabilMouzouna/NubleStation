import archiver from "archiver";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Zips the contents of `dir` (not the dir itself) and returns a Buffer.
 * Files are added at the archive root so Orbit sees index.html at root.
 */
export async function zipDirectory(dir: string): Promise<Buffer> {
  // Verify the directory exists and is readable.
  const info = await stat(dir);
  if (!info.isDirectory()) {
    throw new Error(`${dir} is not a directory`);
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver("zip", { zlib: { level: 6 } });

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("finish", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    archive.directory(dir, false);
    archive.finalize();
  });
}
