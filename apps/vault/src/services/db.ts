import type pg from "pg";

export interface StorageFile {
  id: string;
  app_id: string;
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
       (app_id, collection, filename, storage_path, mime_type, size_bytes, is_public)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      data.appId,
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
