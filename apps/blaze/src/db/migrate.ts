import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";
import { closePool, getPool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// src/db/migrate.ts → apps/blaze/drizzle
const MIGRATIONS_FOLDER = resolve(__dirname, "../../drizzle");

export async function runPlatformMigrations(pool: pg.Pool): Promise<void> {
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}
interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

function readLatestJournalEntry(): { tag: string; checksum: string } | null {
  const journalPath = resolve(MIGRATIONS_FOLDER, "meta/_journal.json");
  if (!existsSync(journalPath)) return null;
  const raw = readFileSync(journalPath, "utf8");
  const journal = JSON.parse(raw) as Journal;
  const entries = journal.entries ?? [];
  if (entries.length === 0) return null;
  const latest = entries[entries.length - 1]!;
  const sqlPath = resolve(MIGRATIONS_FOLDER, `${latest.tag}.sql`);
  if (!existsSync(sqlPath)) return null;
  const sql = readFileSync(sqlPath, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  return { tag: latest.tag, checksum };
}

export async function recordSchemaVersion(pool: pg.Pool): Promise<void> {
  const latest = readLatestJournalEntry();
  if (!latest) return; // no migrations yet — nothing to record
  await pool.query(
    `INSERT INTO platform.schema_version (version, checksum)
     VALUES ($1, $2)
     ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum`,
    [latest.tag, latest.checksum],
  );
}

async function runAsCli() {
  const pool = getPool();
  try {
    await runPlatformMigrations(pool);
    await recordSchemaVersion(pool);
    console.log("platform migrations applied");
  } finally {
    await closePool();
  }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  runAsCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
