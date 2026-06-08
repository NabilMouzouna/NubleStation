# ADR 016 — File Ownership & Sharing (Vault)

**Status:** Accepted
**Date:** 2026-06-06
**Project:** NubleStation
**Author:** Nabil Mouzouna

---

## Context

Vault (ADR 012) stores file metadata keyed on `app_id` only — every file in an app is visible to anyone holding that app's API key. That is correct for *communal* apps but wrong for apps like **Bucket** (a Google-Drive-style file manager) where files must belong to the **person** who uploaded them and stay private unless explicitly shared.

Identity (ADR 014) now gives every human a stable `user_id` and a shared-cookie session across all `*.{org}.local` apps. This is the missing piece: Vault can attribute a file to a *user*, not just an *app*. The model we want is **Cognito + S3** — one identity system, object ownership derived from it, and per-object access rules the developer opts into.

The platform gap that made this impossible before: a Vault call authenticates with the **API key**, so the Gateway only knew the *app*. It injected `apiKeyId` as `X-Nuble-User-Id` (`apps/gateway/src/routes/proxy.ts`). Vault never saw the real human.

---

## Decisions

### 1. The Gateway resolves the session cookie to a real `user_id` on Vault calls

The browser already holds the `nuble_session` cookie scoped to `.{org}.local`, and `api.{org}.local` is under that domain. So:

- The Vault **SDK** sends `credentials: "include"`, attaching the session cookie to its API-key requests.
- The **Gateway**, on `/v1/vault/*`, resolves that cookie against `platform.sessions` (sha256 → `user_id`, expiry-checked) and injects the **real `user_id`** as `X-Nuble-User-Id` instead of `apiKeyId`.
- No cookie (or invalid/expired) ⇒ no user is injected; the request is treated as anonymous (only public reads succeed).

The API key still scopes the request to its app; the cookie adds *who*. Both are required for owner-scoped operations. CORS already echoes the LAN origin with `credentials: true`, so no CORS change is needed.

This change is **Vault-only**. Blaze/Orbit continue to receive `apiKeyId` until they have a reason to be user-aware.

### 2. Ownership: `storage_files.owner_id`

Every uploaded file records the uploading user as `owner_id` (FK `users`, `ON DELETE SET NULL`). `owner_id = null` means a **communal/legacy** file — app-scoped with no per-user owner, preserving Vault's original behaviour for apps that never send a user.

### 3. Three visibility states

- **private** (default) — only the owner (and app-admins, manage-only) can see it.
- **public** — `is_public = true`, world-readable at `api.{org}.local/vault/{slug}/{collection}/{filename}` (anonymous). Reuses the existing flag.
- **shared** — has one or more rows in `vault_grants`.

A file can be private+shared, or public. Public supersedes for reads.

### 4. Sharing: `vault_grants` (per-individual only)

A grant lets one user access one resource owned by another, inside one app:

```
vault_grants(app_id, owner_id, grantee_user_id, collection, filename?, role)
```

- `filename = null` ⇒ **whole-collection** grant (every file the owner has in that collection).
- `filename` set ⇒ single-file grant.
- `role ∈ { viewer, editor }`.

No group/role-based sharing — individuals only, by design (keeps the mental model and the defense story simple). You can only share with users who already have access to the app (Identity's app-user list); they must have an account.

> Note: the unique index treats `filename = NULL` as distinct per Postgres semantics, so the grant service de-duplicates collection-wide grants explicitly (delete-then-insert) rather than relying on `ON CONFLICT`.

### 5. Roles & the two gates

| Role | Read/Download | Upload/Overwrite | Delete | Share | Make public | See private contents |
|---|---|---|---|---|---|---|
| **owner** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (own) |
| **editor** (grant) | ✓ | ✓ | ✓ | — | — | ✓ (granted) |
| **viewer** (grant) | ✓ | — | — | — | — | ✓ (granted) |
| **app-admin** | — | — | ✓ (housekeeping) | — | — | **✗ never** |
| **public** (anon) | ✓ | — | — | — | — | — |

Two independent gates:

1. **App access** (Layer 1, Identity) — are you allowed in this app at all? Default-deny, admin-granted. Already built.
2. **File access** (Layer 2, Vault) — given you're in the app, can you touch *this* object? Owner / grant / public / admin-manage.

**App-admins are manage-only**: they may *list* and *delete/transfer* files for housekeeping (a departing employee's files) but **cannot read** the bytes of a private file they don't own. Vault resolves the caller's app role itself (`user_app_access` + the `decideRole` rule from ADR 014), since it shares the Postgres instance.

### 6. Locked defaults

- New files (and collections, implicitly) are **private**.
- Existing pre-ADR-016 data has no owner; the developer wipes it to start fresh (no backfill migration).

---

## Schema changes (migration `0003`)

- `storage_files += owner_id uuid` (FK `users` `ON DELETE SET NULL`, indexed).
- New table `vault_grants` as above (unique on `app_id, grantee_user_id, collection, filename`; indexes on grantee and owner).

---

## Consequences

- **Vault becomes user-aware** without Blaze/Orbit changing. The Gateway cookie-resolution is the single new trust edge, and it reuses the existing session table — no new secrets.
- **Developers opt in per object**: upload is private by default; `share()` / `setPublic()` are explicit. The SDK exposes `listMine` / `listSharedWithMe` / `listPublic` so a Drive-style UI is a few calls.
- **Defense story**: "one identity, S3-style object ownership, two enforced gates, admins can clean up but cannot snoop." Authorization stays centralized (Gateway + Vault), never delegated to the app frontend.
- **HTTP caveat** (unchanged from ADR 014): without TLS a same-LAN sniffer could capture the cookie; accepted until HTTPS lands.

---

## Alternatives considered

- **Enforce in the app frontend** — rejected; per core decision #9, authorization is never delegated to developers.
- **Ownership in Blaze (a row per file)** — rejected; Vault already owns file metadata, and a second source of truth invites drift.
- **Group/ACL sharing** — deferred; individual grants cover the clinic use cases and keep the model explainable.
