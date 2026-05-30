import { VaultError } from "./errors.js";
import type { ClientConfig, FileResult } from "./types.js";

const BASE = "/v1/vault/files";

async function req(
  config: ClientConfig,
  method: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${config.url}${path}`, {
    method,
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let code = "request_failed";
    try { code = ((await res.json()) as { error?: string }).error ?? code; } catch { /* ignore */ }
    throw new VaultError(res.status, code);
  }

  return res;
}

export function createVaultClient(config: ClientConfig) {
  return {
    /**
     * Upload a file to a collection.
     * Throws VaultError(409) if a file with the same name already exists.
     */
    async upload(
      collection: string,
      filename: string,
      data: Blob | Uint8Array | ArrayBuffer,
    ): Promise<FileResult> {
      let blob: Blob;
      if (data instanceof Blob) {
        blob = data;
      } else {
        const ab = new ArrayBuffer(data.byteLength);
        new Uint8Array(ab).set(new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer));
        blob = new Blob([ab]);
      }
      const form = new FormData();
      form.append("file", blob, filename);
      const res = await req(config, "POST", `${BASE}/${collection}/${filename}`, { body: form });
      return ((await res.json()) as { file: FileResult }).file;
    },

    /**
     * List all files, or files in a specific collection.
     */
    async list(collection?: string): Promise<FileResult[]> {
      const path = collection ? `${BASE}/${collection}` : BASE;
      const res  = await req(config, "GET", path);
      return ((await res.json()) as { files: FileResult[] }).files;
    },

    /**
     * Download a file and return its raw bytes.
     */
    async download(collection: string, filename: string): Promise<ArrayBuffer> {
      const res = await req(config, "GET", `${BASE}/${collection}/${filename}`);
      return res.arrayBuffer();
    },

    /**
     * Make a file public (accessible at api.{org}.local/vault/{slug}/{collection}/{filename})
     * or private (API key required).
     */
    async setPublic(
      collection: string,
      filename: string,
      isPublic: boolean,
    ): Promise<FileResult> {
      const res = await req(config, "PATCH", `${BASE}/${collection}/${filename}`, {
        body:    JSON.stringify({ isPublic }),
        headers: { "content-type": "application/json" },
      });
      return ((await res.json()) as { file: FileResult }).file;
    },

    /**
     * Permanently delete a file and its metadata.
     */
    async delete(collection: string, filename: string): Promise<void> {
      await req(config, "DELETE", `${BASE}/${collection}/${filename}`);
    },
  };
}
