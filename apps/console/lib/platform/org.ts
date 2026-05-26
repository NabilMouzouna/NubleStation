import { getPool } from "@/lib/db";

export interface OrgInfo {
  id: string;
  name: string;
  subdomain_root: string;
  admin_email: string;
}

export async function getOrg(): Promise<OrgInfo | null> {
  try {
    const { rows } = await getPool().query<OrgInfo>(
      `SELECT id, name, subdomain_root, admin_email
       FROM platform.organizations LIMIT 1`,
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function updateOrgName(id: string, name: string): Promise<void> {
  await getPool().query(
    `UPDATE platform.organizations SET name = $1 WHERE id = $2`,
    [name.trim(), id],
  );
}
