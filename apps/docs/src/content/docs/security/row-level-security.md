---
title: Row-Level Security
description: How Postgres RLS enforces tenant isolation at the database layer — not the application layer.
---

## The core guarantee

In NubleStation, tenant isolation is enforced by the database — not by the application code. Even if a developer writes a bug in the DB service, even if a request is malformed, Postgres itself refuses to return another app's rows.

This is not a trust problem. It is a database constraint.

## How RLS works

Postgres Row-Level Security attaches a **policy** to a table. Every query — regardless of what SQL was sent — is filtered by this policy before any row is returned.

```sql
-- Policy on tenant_data.tasks
CREATE POLICY tenant_isolation ON tenant_data.tasks
  USING (app_id = current_setting('app.current_tenant')::uuid)
  WITH CHECK (app_id = current_setting('app.current_tenant')::uuid);
```

- **`USING`** — applied to `SELECT`, `UPDATE`, `DELETE`. Rows where `app_id ≠ current_tenant` are invisible — as if they don't exist.
- **`WITH CHECK`** — applied to `INSERT`, `UPDATE`. Postgres rejects any write where the resulting `app_id` would not equal `current_tenant`.

Together, these four operations are completely covered. An app cannot read, write, update, or delete another app's rows.

## Setting tenant context per request

```sql
BEGIN;
SET LOCAL app.current_tenant = '550e8400-e29b-41d4-a716-446655440000';
-- All queries here are automatically filtered by app_id
SELECT * FROM tenant_data.tasks;
COMMIT;
-- SET LOCAL variable cleared — connection is clean for the next request
```

`SET LOCAL` is transaction-scoped. When the transaction ends, the variable disappears. This is the critical correctness property when using a connection pool: the next request to reuse this connection will not inherit the previous tenant's `app_id`.

## What happens without tenant context

If a query reaches a `tenant_data` table without `app.current_tenant` being set, Postgres raises an error:

```
ERROR: unrecognized configuration parameter "app.current_tenant"
```

It does **not** silently return zero rows. A missing tenant context is a programming bug, and a loud failure surfaces it immediately. Zero rows would be silent and incorrect — you'd have no idea the query was broken.

## Auto-generated per table

When the DB service creates a new tenant table, it automatically runs:

```sql
-- 1. Add the tenant discriminator column
ALTER TABLE tenant_data.tasks ADD COLUMN app_id UUID NOT NULL;

-- 2. Index it — without this, RLS evaluation scans the full table
CREATE INDEX tasks_app_id_idx ON tenant_data.tasks (app_id);

-- 3. Enable RLS (tables start with RLS disabled in Postgres)
ALTER TABLE tenant_data.tasks ENABLE ROW LEVEL SECURITY;

-- 4. Add the isolation policy
CREATE POLICY tenant_isolation ON tenant_data.tasks
  USING (app_id = current_setting('app.current_tenant')::uuid)
  WITH CHECK (app_id = current_setting('app.current_tenant')::uuid);
```

Developers never write this SQL. The schema DSL (`schema.ts`) generates it, and the migration runner applies it. There is no path for a tenant table to exist without this policy.

## Platform tables have RLS off

Tables in `platform.*` (organizations, users, apps, api_keys, etc.) have RLS disabled. They are protected at the **application layer**:

- Only the gateway and its verified services can reach these tables
- Every internal request is HMAC-signed (see [HMAC Request Signing](/security/hmac-signing/))
- App developers never get a Postgres connection string

RLS would add unnecessary overhead on these tables and complicates admin operations. The HMAC trust boundary provides equivalent protection at the network layer.

## Performance

RLS compiles to a standard `WHERE` clause. Postgres optimizes it like any other filter. With an index on `app_id`, the query planner uses an index scan — the same plan as an explicit `WHERE app_id = $1`.

Supabase runs millions of queries through this same pattern at scale. The overhead on a LAN single-host deployment is negligible.

## The isolation test

The canonical cross-tenant isolation test, run in CI:

```typescript
const appA = await createApp('app-a');
const appB = await createApp('app-b');

// Seed one row per app
await insertWithTenant(appA.id, 'tenant_data.notes', { body: 'Note A' });
await insertWithTenant(appB.id, 'tenant_data.notes', { body: 'Note B' });

// Test 1: App A sees only its row
const rowsA = await queryWithTenant(appA.id, 'SELECT * FROM tenant_data.notes');
assert.equal(rowsA.length, 1);
assert.equal(rowsA[0].body, 'Note A');

// Test 2: App A cannot read App B's row by known ID
const leak = await queryWithTenant(appA.id,
  'SELECT * FROM tenant_data.notes WHERE id = $1', [noteBId]);
assert.equal(leak.length, 0);

// Test 3: No tenant context → error
await assert.rejects(
  () => query('SELECT * FROM tenant_data.notes'),
  /current_tenant/i
);
```

This test must remain green through every phase of development. If it regresses, all other work stops until it is fixed.
