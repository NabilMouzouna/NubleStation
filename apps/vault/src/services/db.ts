import type pg from "pg";

export interface StorageFile {
  id: string;
  app_id: string;
  owner_id: string | null;
  collection: string;
  filename: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  is_public: boolean;
  created_at: string;
}

export interface VaultSettings {
  allowed_extensions: string[];
  max_file_bytes: number;
}

const DEFAULT_SETTINGS: VaultSettings = {
  allowed_extensions: [],
  max_file_bytes: 52_428_800, // 50 MB
};

export async function getSettings(
  pool: pg.Pool,
  appId: string,
): Promise<VaultSettings> {
  const r = await pool.query<VaultSettings>(
    `SELECT allowed_extensions, max_file_bytes
     FROM platform.vault_settings WHERE app_id = $1`,
    [appId],
  );
  return r.rows[0] ?? DEFAULT_SETTINGS;
}

export async function fileExistsInDb(
  pool: pg.Pool,
  appId: string,
  collection: string,
  filename: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM platform.storage_files
     WHERE app_id=$1 AND collection=$2 AND filename=$3`,
    [appId, collection, filename],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function insertFile(
  pool: pg.Pool,
  data: {
    appId: string;
    ownerId: string | null;
    collection: string;
    filename: string;
    storagePath: string;
    mimeType: string | null;
    sizeBytes: number;
    isPublic: boolean;
  },
): Promise<StorageFile> {
  const r = await pool.query<StorageFile>(
    `INSERT INTO platform.storage_files
       (app_id, owner_id, collection, filename, storage_path, mime_type, size_bytes, is_public)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      data.appId,
      data.ownerId,
      data.collection,
      data.filename,
      data.storagePath,
      data.mimeType,
      data.sizeBytes,
      data.isPublic,
    ],
  );
  return r.rows[0]!;
}

export async function getFile(
  pool: pg.Pool,
  appId: string,
  collection: string,
  filename: string,
): Promise<StorageFile | null> {
  const r = await pool.query<StorageFile>(
    `SELECT * FROM platform.storage_files
     WHERE app_id=$1 AND collection=$2 AND filename=$3`,
    [appId, collection, filename],
  );
  return r.rows[0] ?? null;
}

/** Used by the public route — resolves slug to app_id and checks is_public. */
export async function getPublicFile(
  pool: pg.Pool,
  appSlug: string,
  collection: string,
  filename: string,
): Promise<StorageFile | null> {
  const r = await pool.query<StorageFile>(
    `SELECT sf.*
     FROM platform.storage_files sf
     JOIN platform.apps a ON a.id = sf.app_id
     WHERE a.name=$1 AND sf.collection=$2 AND sf.filename=$3`,
    [appSlug, collection, filename],
  );
  return r.rows[0] ?? null;
}

export async function listFiles(
  pool: pg.Pool,
  appId: string,
  collection?: string,
): Promise<StorageFile[]> {
  if (collection) {
    const r = await pool.query<StorageFile>(
      `SELECT * FROM platform.storage_files
       WHERE app_id=$1 AND collection=$2
       ORDER BY created_at DESC`,
      [appId, collection],
    );
    return r.rows;
  }
  const r = await pool.query<StorageFile>(
    `SELECT * FROM platform.storage_files
     WHERE app_id=$1
     ORDER BY collection, created_at DESC`,
    [appId],
  );
  return r.rows;
}

export async function setPublic(
  pool: pg.Pool,
  appId: string,
  collection: string,
  filename: string,
  isPublic: boolean,
): Promise<StorageFile | null> {
  const r = await pool.query<StorageFile>(
    `UPDATE platform.storage_files
     SET is_public=$4
     WHERE app_id=$1 AND collection=$2 AND filename=$3
     RETURNING *`,
    [appId, collection, filename, isPublic],
  );
  return r.rows[0] ?? null;
}

export async function deleteFileMeta(
  pool: pg.Pool,
  appId: string,
  collection: string,
  filename: string,
): Promise<StorageFile | null> {
  const r = await pool.query<StorageFile>(
    `DELETE FROM platform.storage_files
     WHERE app_id=$1 AND collection=$2 AND filename=$3
     RETURNING *`,
    [appId, collection, filename],
  );
  return r.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Ownership & access control (ADR 016)
// ---------------------------------------------------------------------------

const ADMIN_ROLES = new Set(["super_admin", "admin"]);

export interface Caller {
  /** Real Identity user id, or null when the request carries no user (a
   *  communal/anonymous API-key-only call). */
  userId: string | null;
  /** True when the caller is an app-admin (manage-only over others' files). */
  isAdmin: boolean;
}

export type GrantRole = "viewer" | "editor";
export type AccessRole = "owner" | "editor" | "viewer" | "admin" | "public" | null;

/**
 * Resolves whether the gateway-injected user id is a real Identity user and
 * whether they are an app-admin for this app. The gateway injects the apiKeyId
 * (not a real user) when no session cookie is present; that id won't exist in
 * platform.users, so we treat it as a communal/anonymous caller (userId=null).
 */
export async function resolveCaller(
  pool: pg.Pool,
  appId: string,
  rawUserId: string,
): Promise<Caller> {
  const r = await pool.query<{ user_role: string; access_role: string | null }>(
    `SELECT u.role AS user_role, ua.role AS access_role
     FROM platform.users u
     LEFT JOIN platform.user_app_access ua
       ON ua.user_id = u.id AND ua.app_id = $2
     WHERE u.id = $1`,
    [rawUserId, appId],
  );
  const row = r.rows[0];
  if (!row) return { userId: null, isAdmin: false };
  const isAdmin = ADMIN_ROLES.has(row.user_role) || row.access_role === "admin";
  return { userId: rawUserId, isAdmin };
}

/** The caller's effective role for one file (ADR 016 §5). */
export async function resolveFileAccess(
  pool: pg.Pool,
  file: StorageFile,
  caller: Caller,
): Promise<AccessRole> {
  // Communal/legacy files (no owner) behave like the pre-ADR-016 model: anyone
  // holding the app's API key has full access.
  if (file.owner_id === null) return "owner";

  if (caller.userId && file.owner_id === caller.userId) return "owner";

  if (caller.userId) {
    const g = await pool.query<{ role: GrantRole }>(
      `SELECT role FROM platform.vault_grants
       WHERE app_id=$1 AND grantee_user_id=$2 AND owner_id=$3 AND collection=$4
         AND (filename = $5 OR filename IS NULL)`,
      [file.app_id, caller.userId, file.owner_id, file.collection, file.filename],
    );
    let grant: GrantRole | null = null;
    for (const row of g.rows) {
      if (row.role === "editor") grant = "editor";
      else if (row.role === "viewer" && grant !== "editor") grant = "viewer";
    }
    if (grant) return grant;
  }

  if (file.is_public) return "public";
  if (caller.isAdmin) return "admin";
  return null;
}

export function canRead(role: AccessRole): boolean {
  return role === "owner" || role === "editor" || role === "viewer" || role === "public";
}
export function canWrite(role: AccessRole): boolean {
  return role === "owner" || role === "editor";
}
export function canDelete(role: AccessRole): boolean {
  return role === "owner" || role === "editor" || role === "admin";
}
export function canManage(role: AccessRole): boolean {
  // Share / make-public / transfer — owner only.
  return role === "owner";
}

// ---------------------------------------------------------------------------
// Scoped listings (ADR 016)
// ---------------------------------------------------------------------------

/** Files the caller owns. */
export async function listMine(
  pool: pg.Pool,
  appId: string,
  ownerId: string,
  collection?: string,
): Promise<StorageFile[]> {
  const params: unknown[] = [appId, ownerId];
  let sql = `SELECT * FROM platform.storage_files WHERE app_id=$1 AND owner_id=$2`;
  if (collection) {
    params.push(collection);
    sql += ` AND collection=$3`;
  }
  sql += ` ORDER BY collection, created_at DESC`;
  const r = await pool.query<StorageFile>(sql, params);
  return r.rows;
}

/** Files shared with the caller, annotated with the granted role. */
export async function listSharedWithMe(
  pool: pg.Pool,
  appId: string,
  granteeId: string,
): Promise<(StorageFile & { role: GrantRole })[]> {
  const r = await pool.query<StorageFile & { role: GrantRole }>(
    `SELECT DISTINCT ON (sf.id) sf.*, g.role
     FROM platform.storage_files sf
     JOIN platform.vault_grants g
       ON g.app_id = sf.app_id AND g.owner_id = sf.owner_id
      AND g.collection = sf.collection
      AND (g.filename = sf.filename OR g.filename IS NULL)
     WHERE sf.app_id=$1 AND g.grantee_user_id=$2
     ORDER BY sf.id, g.role DESC`, // 'viewer' < 'editor' lexically → editor wins
    [appId, granteeId],
  );
  return r.rows;
}

/** Public files in the app. */
export async function listPublic(
  pool: pg.Pool,
  appId: string,
  collection?: string,
): Promise<StorageFile[]> {
  const params: unknown[] = [appId];
  let sql = `SELECT * FROM platform.storage_files WHERE app_id=$1 AND is_public=true`;
  if (collection) {
    params.push(collection);
    sql += ` AND collection=$2`;
  }
  sql += ` ORDER BY collection, created_at DESC`;
  const r = await pool.query<StorageFile>(sql, params);
  return r.rows;
}

/**
 * Everything the caller may see: communal ∪ own ∪ public ∪ shared-with-me.
 * App-admins see every file in the app (housekeeping). Backs the generic
 * GET /files and GET /files/:collection.
 */
export async function listAccessible(
  pool: pg.Pool,
  appId: string,
  caller: Caller,
  collection?: string,
): Promise<StorageFile[]> {
  if (caller.isAdmin) {
    return listFiles(pool, appId, collection);
  }
  const params: unknown[] = [appId, caller.userId];
  let sql = `
    SELECT DISTINCT sf.* FROM platform.storage_files sf
    LEFT JOIN platform.vault_grants g
      ON g.app_id = sf.app_id AND g.owner_id = sf.owner_id
     AND g.collection = sf.collection
     AND (g.filename = sf.filename OR g.filename IS NULL)
     AND g.grantee_user_id = $2
    WHERE sf.app_id = $1
      AND ( sf.owner_id IS NULL
            OR sf.owner_id = $2
            OR sf.is_public = true
            OR g.id IS NOT NULL )`;
  if (collection) {
    params.push(collection);
    sql += ` AND sf.collection = $3`;
  }
  sql += ` ORDER BY sf.collection, sf.created_at DESC`;
  const r = await pool.query<StorageFile>(sql, params);
  return r.rows;
}

// ---------------------------------------------------------------------------
// Grants (sharing) — ADR 016 §4
// ---------------------------------------------------------------------------

export interface GrantRow {
  id: string;
  grantee_user_id: string;
  grantee_email: string;
  grantee_name: string | null;
  collection: string;
  filename: string | null;
  role: GrantRole;
  created_at: string;
}

/** Idempotent upsert. `filename = null` ⇒ whole-collection grant. The unique
 *  index treats NULL filename as distinct, so we delete-then-insert. */
export async function createGrant(
  pool: pg.Pool,
  g: {
    appId: string;
    ownerId: string;
    granteeUserId: string;
    collection: string;
    filename: string | null;
    role: GrantRole;
  },
): Promise<void> {
  await pool.query(
    `DELETE FROM platform.vault_grants
     WHERE app_id=$1 AND owner_id=$2 AND grantee_user_id=$3 AND collection=$4
       AND filename IS NOT DISTINCT FROM $5`,
    [g.appId, g.ownerId, g.granteeUserId, g.collection, g.filename],
  );
  await pool.query(
    `INSERT INTO platform.vault_grants
       (app_id, owner_id, grantee_user_id, collection, filename, role)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [g.appId, g.ownerId, g.granteeUserId, g.collection, g.filename, g.role],
  );
}

export async function deleteGrant(
  pool: pg.Pool,
  g: {
    appId: string;
    ownerId: string;
    granteeUserId: string;
    collection: string;
    filename: string | null;
  },
): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM platform.vault_grants
     WHERE app_id=$1 AND owner_id=$2 AND grantee_user_id=$3 AND collection=$4
       AND filename IS NOT DISTINCT FROM $5`,
    [g.appId, g.ownerId, g.granteeUserId, g.collection, g.filename],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Grants on one resource, owned by `ownerId`, with grantee identity joined. */
export async function listGrants(
  pool: pg.Pool,
  appId: string,
  ownerId: string,
  collection: string,
  filename: string | null,
): Promise<GrantRow[]> {
  const r = await pool.query<GrantRow>(
    `SELECT g.id, g.grantee_user_id, u.email AS grantee_email,
            u.display_name AS grantee_name, g.collection, g.filename,
            g.role, g.created_at
     FROM platform.vault_grants g
     JOIN platform.users u ON u.id = g.grantee_user_id
     WHERE g.app_id=$1 AND g.owner_id=$2 AND g.collection=$3
       AND g.filename IS NOT DISTINCT FROM $4
     ORDER BY g.created_at DESC`,
    [appId, ownerId, collection, filename],
  );
  return r.rows;
}
