import archiver from "archiver";

export async function makeZipBuffer(files: Record<string, string>): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver("zip", { zlib: { level: 0 } });

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("finish", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    archive.on("error", reject);

    for (const [name, content] of Object.entries(files)) {
      archive.append(Buffer.from(content), { name });
    }

    archive.finalize();
  });
}

export function makeMinimalZip(): Promise<Uint8Array> {
  return makeZipBuffer({ "index.html": "<h1>hello</h1>" });
}

export function makeZipWithoutIndexHtml(): Promise<Uint8Array> {
  return makeZipBuffer({ "app.js": 'console.log("hi")' });
}
