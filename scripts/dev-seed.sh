#!/usr/bin/env sh
# Creates apps/console/dev.db seeded with a test org and super admin.
# Run once before `pnpm dev` in apps/console.
#
# Usage:
#   sh scripts/dev-seed.sh
#   sh scripts/dev-seed.sh admin@test.com mypassword

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB="$REPO_ROOT/apps/console/dev.db"

EMAIL="${1:-admin@test.com}"
PASSWORD="${2:-password123}"

command -v sqlite3 >/dev/null 2>&1 || { printf 'sqlite3 is required\n' >&2; exit 1; }
command -v node    >/dev/null 2>&1 || { printf 'node is required\n' >&2; exit 1; }

printf 'Creating %s\n' "$DB"
rm -f "$DB"
sqlite3 "$DB" < "$SCRIPT_DIR/seed-admin.sql"

printf 'Hashing password...\n'
HASH="$(node --input-type=module <<EOF
import { hash } from '@node-rs/argon2';
const h = await hash('$PASSWORD');
process.stdout.write(h);
EOF
)"

ORG_ID="dev-org-1"
ADMIN_ID="dev-admin-1"

sqlite3 "$DB" <<SQL
PRAGMA foreign_keys = ON;
INSERT INTO organization (id, name, description, installed_at)
  VALUES ('$ORG_ID', 'Dev Clinic', 'Local dev org', unixepoch());
INSERT INTO admin_users (id, org_id, email, password_hash, role, created_at)
  VALUES ('$ADMIN_ID', '$ORG_ID', '$EMAIL', '$HASH', 'super_admin', unixepoch());
SQL

printf 'Done.\n'
printf '  DB:    %s\n' "$DB"
printf '  Email: %s\n' "$EMAIL"
printf '  Pass:  %s\n' "$PASSWORD"
printf '\nCopy .env.local.example to .env.local, then run: pnpm dev\n'
