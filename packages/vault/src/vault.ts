import { VaultError } from "./errors.js";
import type { ClientConfig, FileResult, Grant, GrantRole } from "./types.js";

const BASE = "/v1/vault/files";
const GRANTS = "/v1/vault/grants";

async function req(
  config: ClientConfig,
  method: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${config.url}${path}`, {
    method,
    ...init,
    // ADR 016: send the .{org}.local session cookie alongside the API key so the
    // Gateway can resolve the calling user for per-user ownership. Harmless for
    // communal apps (no cookie present). CORS already allows credentials.
    credentials: "include",
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
     * List every file the caller can see (own ∪ shared ∪ public ∪ communal),
     * optionally scoped to one collection. App-admins see all files.
     */
    async list(collection?: string): Promise<FileResult[]> {
      const path = collection ? `${BASE}/${collection}` : BASE;
      const res  = await req(config, "GET", path);
      return ((await res.json()) as { files: FileResult[] }).files;
    },

    /**
     * List files the signed-in user owns (ADR 016), optionally in one collection.
     * Requires a session cookie — returns [] for communal/anonymous callers.
     */
    async listMine(collection?: string): Promise<FileResult[]> {
      const path = collection ? `${BASE}/mine/${collection}` : `${BASE}/mine`;
      const res  = await req(config, "GET", path);
      return ((await res.json()) as { files: FileResult[] }).files;
    },

    /** List files other users have shared with the signed-in user. */
    async listSharedWithMe(): Promise<FileResult[]> {
      const res = await req(config, "GET", `${BASE}/shared`);
      return ((await res.json()) as { files: FileResult[] }).files;
    },

    /** List public files in this app, optionally scoped to one collection. */
    async listPublic(collection?: string): Promise<FileResult[]> {
      const path = collection ? `${BASE}/public/${collection}` : `${BASE}/public`;
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

    /**
     * Share a file (or a whole collection, when `filename` is null) with one
     * user, as viewer or editor (ADR 016). Only the owner may share. Idempotent
     * — re-sharing updates the role.
     */
    async share(
      collection: string,
      filename: string | null,
      granteeUserId: string,
      role: GrantRole,
    ): Promise<void> {
      await req(config, "POST", GRANTS, {
        body:    JSON.stringify({ collection, filename, granteeUserId, role }),
        headers: { "content-type": "application/json" },
      });
    },

    /** Revoke a share previously created with `share()`. */
    async unshare(
      collection: string,
      filename: string | null,
      granteeUserId: string,
    ): Promise<void> {
      await req(config, "DELETE", GRANTS, {
        body:    JSON.stringify({ collection, filename, granteeUserId }),
        headers: { "content-type": "application/json" },
      });
    },

    /**
     * List who a resource you own is shared with. Pass `filename = null` for a
     * collection-level resource.
     */
    async listGrants(collection: string, filename: string | null): Promise<Grant[]> {
      const qs = new URLSearchParams({ collection });
      if (filename) qs.set("filename", filename);
      const res = await req(config, "GET", `${GRANTS}?${qs.toString()}`);
      return ((await res.json()) as { grants: Grant[] }).grants;
    },
  };
}
