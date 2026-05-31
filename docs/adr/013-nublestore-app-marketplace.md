# ADR 013 — NubleStore: App Marketplace

**Status:** Planned
**Date:** 2026-05-31

---

## Context

Clinic staff often need common tools — a file manager, a patient CRM, a scheduling board — that developers would otherwise build from scratch for each organisation. NubleStation already provides all the backend services these apps need (Vault for files, Blaze for data, Identity for auth). The gap is discoverability and installation: there is no way for an admin to browse available apps and install one without a developer deploying it manually.

A marketplace of pre-built apps that can be installed in one click would:

1. Reduce time-to-value for clinics (install a file manager in 30 seconds, no developer required)
2. Demonstrate the platform's end-to-end story — the same services developers build on are the ones pre-built apps run on
3. Create a tangible artefact for the PFE defense: a working app store is more compelling than a blank console

---

## Decision

### What NubleStore is

NubleStore is a catalogue of pre-built NubleStation apps that clinic admins can browse and install from the Console. Each app is:

- A static frontend bundle (Vite/React or any SPA)
- Built against `@nublestation/vault`, `@nublestation/blaze`, or `@nublestation/identity`
- Hosted as a release artifact (GitHub Releases or any static URL)
- Described by a manifest entry (name, description, icon, `bundleUrl`, `requires`)

### How install works

"Install" is exactly what a developer does manually — it reuses every existing platform primitive:

```
Admin clicks Install
      │
      ▼
Console server action
      │
      ├── createApp(slug, displayName)     →  row in platform.apps
      ├── generateApiKey(appId)             →  row in platform.api_keys
      ├── fetch(bundleUrl)                  →  zip bytes from registry
      └── forwardSigned → Orbit /v1/orbit/deploy  →  atomic deploy
                                                        │
                                                  Caddy serves {slug}.{org}.local
```

No new infrastructure. No new service. The install action is ~30 lines of server-side code.

### The app manifest

A single JSON file (`packages/store-manifest/apps.json`) describes available apps:

```json
[
  {
    "id": "bucket",
    "name": "Bucket",
    "description": "File manager — upload, organise, and share files with your team.",
    "icon": "vault",
    "category": "storage",
    "bundleUrl": "https://github.com/NabilMouzouna/NubleStation/releases/latest/download/bucket.zip",
    "version": "1.0.0",
    "requires": ["vault"]
  }
]
```

The manifest is read by the Console at runtime (server-side fetch) or bundled at build time. A static GitHub URL is sufficient for v1.

### The Console Store page

A new `/store` page in Console lists app cards (name, description, icon, required services). Each card has an **Install** button. If the app's required services are healthy, the button is enabled. Clicking it opens a dialog to confirm the slug (defaulting to the app ID), then runs the install action.

### The first store app: Bucket

Bucket is an existing file manager SPA (`apps/bucket/`) built with React + Vite. It currently uses `localStorage` as a mock backend. The only change needed to make it a real NubleStore app is wiring `useVaultStore.ts` to call `@nublestation/vault` instead of localStorage.

Once wired:
1. `vite build` → `dist/`
2. `zip -r bucket.zip dist/` → attach to GitHub Release
3. Add manifest entry
4. Install from Console → live at `bucket.{org}.local`

---

## Why it fits the existing architecture

| NubleStore concept | Existing mechanism |
|---|---|
| App registration | `platform.apps` row — already exists |
| API key for store app | `platform.api_keys` row — already exists |
| Bundle hosting | GitHub Releases artifact |
| Bundle deployment | Orbit `POST /v1/orbit/deploy` — already exists |
| Subdomain routing | Caddy wildcard `*.{org}.local` — already works |
| File storage for store apps | Vault — already exists |
| Auth for store app users | Identity — planned |

The platform already does everything. NubleStore is a UI layer on top of existing primitives.

---

## Consequences

- No new service, no new Docker container, no new database table needed for v1.
- The bundle registry is GitHub Releases — simple, works offline if cached, zero infrastructure cost.
- App versioning is implicit in the release URL (`/latest/download/` vs `/download/v1.2.0/`).
- Offline install is not supported in v1 — the host must reach the bundle URL at install time. A local cache is v2 work.
- The manifest is currently a static file in the repo — a dynamic registry (API, submissions, reviews) is out of scope for the PFE.

---

## References

- ADR 007 — Orbit deployment service (the mechanism NubleStore install uses)
- ADR 012 — Vault storage service (used by Bucket, the first store app)
- `apps/bucket/` — the first candidate store app
