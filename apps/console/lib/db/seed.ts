import { readFile, writeFile } from "node:fs/promises";
import { getPool } from "./index";

export async function ensureSuperAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const orgDomain = process.env.ORG_DOMAIN ?? "nuble";

  if (!email || !hash) {
    return;
  }

  const pool = getPool();

  const { rows: orgs } = await pool.query(
    `SELECT id FROM platform.organizations LIMIT 1`,
  );
  if (orgs.length === 0) {
    await pool.query(
      `INSERT INTO platform.organizations (name, subdomain_root, admin_email)
       VALUES ($1, $2, $3)`,
      [orgDomain, orgDomain, email],
    );
    console.log("[seed] organization seeded:", orgDomain);
  } else if (orgs[0]) {
    await pool.query(
      `UPDATE platform.organizations
       SET name=$1, subdomain_root=$2, admin_email=$3
       WHERE id=$4`,
      [orgDomain, orgDomain, email, orgs[0].id],
    );
    console.log("[seed] organization updated:", orgDomain);
  }

  await pool.query(
    `INSERT INTO platform.users (email, password_hash, role, display_name, is_active)
     VALUES ($1, $2, 'super_admin', 'Super Admin', true)
     ON CONFLICT (email) DO NOTHING`,
    [email, hash],
  );
  console.log("[seed] super admin ready:", email);

  await scrubEnvFile();
}

async function scrubEnvFile(): Promise<void> {
  const path = "/app/.env.platform";
  try {
    const content = await readFile(path, "utf-8");
    const scrubbed = content
      .split("\n")
      .filter((l) => !l.startsWith("ADMIN_EMAIL=") && !l.startsWith("ADMIN_PASSWORD_HASH="))
      .join("\n");
    await writeFile(path, scrubbed, "utf-8");
    console.log("[seed] sensitive vars removed from .env");
  } catch {
    // not mounted in dev — acceptable
  }
}
