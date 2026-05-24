import { getPlatformPool } from "./db";

export interface RecentDeployEvent {
  id: string;
  app_slug: string;
  display_name: string;
  version: string;
  deployed_at: string;
}

export async function getRecentDeployments(limit = 8): Promise<RecentDeployEvent[]> {
  const pool = getPlatformPool();
  const { rows } = await pool.query<RecentDeployEvent>(
    `SELECT d.id, a.name AS app_slug, a.display_name, d.version, d.deployed_at
     FROM platform.deployments d
     JOIN platform.apps a ON a.id = d.app_id
     ORDER BY d.deployed_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}
