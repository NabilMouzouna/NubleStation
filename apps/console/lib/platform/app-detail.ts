import { getPlatformPool } from "./db";

export interface AppDetail {
  id: string;
  name: string;
  display_name: string;
  created_at: string;
}

export interface DeploymentRow {
  id: string;
  version: string;
  file_path: string;
  deployed_at: string;
}

export interface ApiKeyRow {
  id: string;
  key_id: string;
  label: string | null;
  created_at: string;
  revoked_at: string | null;
  expires_at: string | null;
}

export interface AppTableRow {
  id: string;
  table_name: string;
  created_at: string;
}

export async function getAppBySlug(slug: string): Promise<AppDetail | null> {
  const pool = getPlatformPool();
  const { rows } = await pool.query<AppDetail>(
    `SELECT id, name, display_name, created_at FROM platform.apps WHERE name = $1`,
    [slug],
  );
  return rows[0] ?? null;
}

export async function getDeployments(appId: string): Promise<DeploymentRow[]> {
  const pool = getPlatformPool();
  const { rows } = await pool.query<DeploymentRow>(
    `SELECT id, version, file_path, deployed_at
     FROM platform.deployments
     WHERE app_id = $1
     ORDER BY deployed_at DESC
     LIMIT 50`,
    [appId],
  );
  return rows;
}

export async function getApiKeys(appId: string): Promise<ApiKeyRow[]> {
  const pool = getPlatformPool();
  const { rows } = await pool.query<ApiKeyRow>(
    `SELECT id, key_id, label, created_at, revoked_at, expires_at
     FROM platform.api_keys
     WHERE app_id = $1
     ORDER BY created_at DESC`,
    [appId],
  );
  return rows;
}

export interface StorageFileRow {
  id: string;
  collection: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  is_public: boolean;
  created_at: string;
}

export interface VaultSettingsRow {
  allowed_extensions: string[];
  max_file_bytes: number;
}

export async function getStorageFiles(appId: string): Promise<StorageFileRow[]> {
  const pool = getPlatformPool();
  const { rows } = await pool.query<StorageFileRow>(
    `SELECT id, collection, filename, mime_type, size_bytes, is_public, created_at
     FROM platform.storage_files
     WHERE app_id = $1
     ORDER BY collection, created_at DESC`,
    [appId],
  );
  return rows;
}

export async function getVaultSettings(appId: string): Promise<VaultSettingsRow> {
  const pool = getPlatformPool();
  const { rows } = await pool.query<VaultSettingsRow>(
    `SELECT allowed_extensions, max_file_bytes
     FROM platform.vault_settings WHERE app_id = $1`,
    [appId],
  );
  return rows[0] ?? { allowed_extensions: [], max_file_bytes: 52_428_800 };
}

export interface StorageStatRow {
  id: string;
  name: string;
  display_name: string;
  file_count: number;
  total_bytes: number;
}

export async function getStorageStats(): Promise<StorageStatRow[]> {
  const pool = getPlatformPool();
  const { rows } = await pool.query<StorageStatRow>(
    `SELECT a.id, a.name, a.display_name,
            COUNT(sf.id)::int            AS file_count,
            COALESCE(SUM(sf.size_bytes), 0)::bigint AS total_bytes
     FROM platform.apps a
     LEFT JOIN platform.storage_files sf ON sf.app_id = a.id
     WHERE a.name <> 'identity-system'
     GROUP BY a.id, a.name, a.display_name
     ORDER BY total_bytes DESC`,
  );
  return rows;
}

export interface AppUserRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
}

export interface OrgAdminRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
}

/** Org-level admins — implicit admin on every app (ADR 014). */
export async function getOrgAdmins(): Promise<OrgAdminRow[]> {
  const { rows } = await getPlatformPool().query<OrgAdminRow>(
    `SELECT id, email, display_name, avatar_url, role
     FROM platform.users
     WHERE role IN ('super_admin', 'admin') AND is_active = true
     ORDER BY email`,
  );
  return rows;
}

/** End-users with explicit per-app grants. */
export async function getAppUsers(appId: string): Promise<AppUserRow[]> {
  const pool = getPlatformPool();
  const { rows } = await pool.query<AppUserRow>(
    `SELECT u.id, u.email, u.display_name, u.avatar_url, ua.role, ua.created_at
     FROM platform.user_app_access ua
     JOIN platform.users u ON u.id = ua.user_id
     WHERE ua.app_id = $1
     ORDER BY u.email`,
    [appId],
  );
  return rows;
}

export async function getAppTables(appId: string): Promise<AppTableRow[]> {
  const pool = getPlatformPool();
  const { rows } = await pool.query<AppTableRow>(
    `SELECT id, table_name, created_at
     FROM platform.app_tables
     WHERE app_id = $1
     ORDER BY created_at ASC`,
    [appId],
  );
  return rows;
}
