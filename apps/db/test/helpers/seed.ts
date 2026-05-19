import type pg from "pg";

export interface SeededApps {
  appA: string;
  appB: string;
}

/**
 * Inserts two minimal platform.apps rows and returns their UUIDs. The
 * isolation tests use these as tenant boundaries when calling withTenant().
 */
export async function seedTwoApps(pool: pg.Pool): Promise<SeededApps> {
  const a = await pool.query<{ id: string }>(
    "INSERT INTO platform.apps (name, display_name) VALUES ($1, $2) RETURNING id",
    ["test_app_a", "Test App A"],
  );
  const b = await pool.query<{ id: string }>(
    "INSERT INTO platform.apps (name, display_name) VALUES ($1, $2) RETURNING id",
    ["test_app_b", "Test App B"],
  );
  return { appA: a.rows[0]!.id, appB: b.rows[0]!.id };
}
