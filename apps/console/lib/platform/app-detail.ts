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
