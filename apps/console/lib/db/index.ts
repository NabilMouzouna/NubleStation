import Database, { type Database as BetterSqliteDB } from "better-sqlite3";

const DB_PATH = process.env.ADMIN_DB_PATH ?? "/app/admin.db";

const db: BetterSqliteDB = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export default db;
