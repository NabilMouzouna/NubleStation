# Platform Schema — Entity Relationship Diagram

The `platform` PostgreSQL schema holds all NubleStation infrastructure tables. These are shared across tenants and managed exclusively by the platform layer — app developers never access them directly.

Ten tables are defined under `pgSchema("platform")` in `apps/db/src/db/schema/platform.ts` and migrated via drizzle-kit on service boot (see ADR 003 §11).

```mermaid
erDiagram
    ORGANIZATIONS {
        uuid id PK
        string name
        string domain
        timestamptz created_at
    }

    USERS {
        uuid id PK
        uuid org_id FK
        string email
        string password_hash
        string role
        timestamptz created_at
    }

    APPS {
        uuid id PK
        uuid org_id FK
        string name
        string slug
        timestamptz created_at
    }

    API_KEYS {
        uuid id PK
        uuid app_id FK
        string key_id
        string secret_hash
        timestamptz revoked_at
        timestamptz created_at
    }

    USER_APP_ACCESS {
        uuid id PK
        uuid user_id FK
        uuid app_id FK
        string role
        timestamptz created_at
    }

    APP_TABLES {
        uuid id PK
        uuid app_id FK
        string table_name
        timestamptz created_at
    }

    DEPLOYMENTS {
        uuid id PK
        uuid app_id FK
        string version
        string status
        timestamptz deployed_at
        timestamptz created_at
    }

    MIGRATIONS {
        uuid id PK
        uuid app_id FK
        string version
        string checksum
        timestamptz applied_at
        timestamptz created_at
    }

    SCHEMA_VERSION {
        uuid id PK
        string version
        string checksum
        timestamptz applied_at
        timestamptz created_at
    }

    AUDIT_LOG {
        uuid id PK
        uuid org_id FK
        uuid app_id FK
        uuid user_id FK
        string action
        jsonb metadata
        timestamptz created_at
    }

    ORGANIZATIONS ||--o{ USERS : "has"
    ORGANIZATIONS ||--o{ APPS : "owns"
    ORGANIZATIONS ||--o{ AUDIT_LOG : "records"
    APPS ||--o{ API_KEYS : "issues"
    APPS ||--o{ USER_APP_ACCESS : "grants"
    APPS ||--o{ APP_TABLES : "reserves"
    APPS ||--o{ DEPLOYMENTS : "tracks"
    APPS ||--o{ MIGRATIONS : "logs"
    APPS ||--o{ AUDIT_LOG : "scoped to"
    USERS ||--o{ USER_APP_ACCESS : "receives"
    USERS ||--o{ AUDIT_LOG : "performed by"
```

## Key Design Notes

- **`api_keys.key_id`** — plaintext indexed column used for O(1) lookup; `secret_hash` is Argon2id. API key format: `nbl_<key_id>.<secret>` (ADR 003 §4).
- **`app_tables.table_name`** — org-wide unique reservation. Prevents two apps in the same org from claiming the same `tenant_data.*` table name (ADR 003 §4).
- **`schema_version`** — platform self-migration tracking. One row per applied Drizzle migration, with SHA-256 checksum of the SQL file (ADR 003 §11).
- **`audit_log`** — append-only. No UPDATE/DELETE policies; written by platform middleware, not app code.
- **No `tenant_data` tables here** — app-defined tables live in the `tenant_data` schema with RLS + `FORCE ROW LEVEL SECURITY`. They are created dynamically by the migration runner (Phase 3) and in tests by `helpers/tenant-data.ts`.
- **RLS is OFF on all `platform.*` tables** — access is controlled at the application layer (HMAC-verified gateway → DB service middleware).
