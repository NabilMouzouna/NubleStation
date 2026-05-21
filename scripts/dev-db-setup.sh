#!/usr/bin/env bash
# Idempotent bootstrap for the local Postgres role + databases used by apps/blaze
# on a developer Mac. Run once after installing Postgres (e.g. via Homebrew).
#
# Creates:
#   - role     nuble  (LOGIN, CREATEDB, password 'nuble')
#   - database nuble_dev   owned by nuble
#   - database nuble_test  owned by nuble
#
# Re-running is safe; existing role/databases are left in place.

set -euo pipefail

ROLE="${NUBLE_DB_ROLE:-nuble}"
PASSWORD="${NUBLE_DB_PASSWORD:-nuble}"
DEV_DB="${NUBLE_DB_DEV:-nuble_dev}"
TEST_DB="${NUBLE_DB_TEST:-nuble_test}"

# Pick a superuser DB to connect to for the bootstrap. `postgres` is the
# Homebrew default; fall back to the current user's DB if it doesn't exist.
ADMIN_DB="${NUBLE_ADMIN_DB:-postgres}"

echo "==> ensuring role '$ROLE' exists"
psql -d "$ADMIN_DB" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$ROLE') THEN
    EXECUTE format('CREATE ROLE %I WITH LOGIN CREATEDB PASSWORD %L', '$ROLE', '$PASSWORD');
  END IF;
END
\$\$;
SQL

create_db_if_missing() {
  local db="$1"
  if psql -d "$ADMIN_DB" -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1; then
    echo "==> database '$db' already exists, skipping"
  else
    echo "==> creating database '$db' owned by '$ROLE'"
    psql -d "$ADMIN_DB" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$db\" OWNER \"$ROLE\";"
  fi
}

create_db_if_missing "$DEV_DB"
create_db_if_missing "$TEST_DB"

echo "==> done"
echo
echo "Connection string for apps/blaze/.env.local:"
echo "  DATABASE_URL=postgres://$ROLE:$PASSWORD@localhost:5432/$DEV_DB"
echo "  DATABASE_URL_TEST=postgres://$ROLE:$PASSWORD@localhost:5432/$TEST_DB"
