# ADR 002 — Console design system: Meta-inspired tokens + sitemap

**Status:** Accepted
**Date:** 2026-05-10
**Updated:** 2026-05-21

## Context

The Console (Next.js admin dashboard at `console.{org}.local`) is the only surface end users — clinic admins, IT, developers deploying apps — see directly. It needs a coherent design system before component work begins. Building one from scratch costs weeks; importing a full off-the-shelf kit (shadcn/ui, Mantine) gives speed but no brand identity that matches the "private cloud appliance" positioning.

## Decision

Adopt a **Meta-inspired token system** as Console's foundation: pill buttons (`rounded.full` 100px), a stark white canvas, a single saturated cobalt accent (`#0064E0`) for primary action, an Optimistic VF–style display face with `ss01`/`ss02` stylistic sets, a 4px spacing base, and `rounded.xxxl` (32px) card geometry as the dominant signature.

## Rationale

| Concern | From scratch | Stock UI kit | Meta-inspired tokens |
|---|---|---|---|
| **Time to first component** | Weeks | Hours | ~1 day to wire tokens |
| **Brand identity** | Whatever ships | Generic | Confident hardware-merchandiser voice — fits "Synology NAS for developers" |
| **Token discipline** | Risk of drift | Imposed by library | Imposed by this ADR |
| **Surface fit for admin** | TBD | Neutral | Good once commerce surfaces are stripped |

NubleStation is positioned as a hardware appliance for clinics. Meta's hardware-commerce voice — dark-pill CTA on stark white, single cobalt accent, photography-light cards — translates cleanly to an infrastructure console. The pill + `rounded.xxxl` card pairing is the recognizable signature carried across.

## Adaptations

The reference spec was a commerce design language. Console is admin software, so:

- **Primary CTA is the cobalt pill.** The dual-CTA pattern (black marketing pill + cobalt buy pill) collapses to one — Console has no marketing surface, every action is a "do it" affordance.
- **Drop:** promo strips, checkout summary cards, SKU pickers, product galleries, warranty cards, testimonial cards, promo banners, sale badges. None map to admin tasks.
- **Keep:** the button family, icon-feature cards, feature cards, text inputs, radio options, semantic badges (success/critical/attention/warning), accordion items, spec tables (reused as resource detail layouts), and the footer region.
- **Typography:** Optimistic VF is proprietary. Use Inter (or another open variable face that exposes equivalent stylistic sets) with the same `ss01`/`ss02` switching pattern; preserve the negative letter-spacing on body roles.
- **Dark mode:** flagged as a gap in the source spec. Deferred until 1.0 — clinic environments are bright and admin sessions are short.

## Consequences

- A `packages/design/` workspace exports tokens as CSS custom properties + a typed TS module, consumed by `apps/console`.
- The fallback variable typeface must be picked and committed before component work starts.
- Adopting this voice locks Console into pill buttons everywhere and `rounded.xxxl` cards — squared buttons or sharp cards will read as "third-party widget" against the rest of the surface.
- The reference DESIGN.md spec is removed in the same commit as this ADR; subsequent component work references this ADR and the `packages/design/` source as authoritative.

## References

- ADR 001 — separates Console as its own deployable surface, which is what justifies giving it a dedicated design identity.

---

## Sitemap

### Route inventory

| Route | Access | Description |
|---|---|---|
| `/` | Any (redirects) | Landing — redirects to `/dashboard` if authenticated, else `/auth` |
| `/auth` | Public | Login gate — email + password against `admin.db` |
| `/dashboard` | Auth required | Infra health overview: service status, uptime, recent events |
| `/watch` | Auth required | Live log tail — Docker logs + HMAC-signed service events |
| `/apps` | Auth required | App registry — list all apps, per-app usage, create new app |
| `/apps/:app` | Auth required | App detail — deployments, env vars, API keys, DB, storage, migrations, users |
| `/admins` | super_admin only | Manage platform admins — invite, revoke, role assignment |
| `/audit` | Auth required | Platform audit log — every mutating admin action from `platform_audit` |
| `/settings` | super_admin only | Org info, host network config, HMAC secret rotation |
| `/network` | Auth required | Topology view — DNS zones, Caddy upstreams, registered subdomains |
| `/storage` | Auth required | Org-wide disk usage — total used, per-app breakdown, largest files |

### Navigation flow

```mermaid
flowchart TD
    Root["/"] -->|no session| Auth["/auth"]
    Root -->|valid session| Dashboard["/dashboard"]
    Auth -->|login success| Dashboard

    Dashboard --> Watch["/watch"]
    Dashboard --> Apps["/apps"]
    Dashboard --> Network["/network"]
    Dashboard --> Storage["/storage"]
    Dashboard --> Audit["/audit"]
    Dashboard --> Admins["/admins"]
    Dashboard --> Settings["/settings"]

    subgraph Sidebar["Sidebar nav (authenticated)"]
        Dashboard
        Watch
        Apps
        Network
        Storage
        Audit
        Admins
        Settings
    end

    Apps -->|select app| AppDetail["/apps/:app"]
    Apps -->|create button| AppDetail

    AppDetail -->|back| Apps

    note1["admins + settings:\nsuper_admin role only"]
```

### Layout structure

```mermaid
flowchart LR
    subgraph Shell["App shell (authenticated routes)"]
        Sidebar["Sidebar\n─────\nLogo\nDashboard\nWatch\nApps\nNetwork\nStorage\nAudit\n─────\nAdmins ①\nSettings ①\n─────\nOrg name\nLogout"] -->|renders| Main["Main area\n(route content)"]
    end
```

① Admins and Settings are sidebar items visible only to `super_admin` role. `admin` role users see the same shell but those items are hidden and the routes return 403.

Auth (`/auth`) renders without the shell — full-page centered card.

---

## Pages

### `/` — Root redirect

No UI. Server component reads session cookie:
- Valid session → `redirect('/dashboard')`
- No session → `redirect('/auth')`

---

### `/auth` — Login

```mermaid
flowchart TD
    Load["Page load\n(server component)"] -->|validateSession → admin row| LoggedIn["redirect /dashboard"]
    Load -->|no session| Form["Render login form\n(client component)"]

    Form -->|submit| Action["login() server action\n─────────────────\n1. lookup email in admin_users\n2. argon2.verify(hash, password)\n3. createSession(id)\n4. redirect /dashboard"]

    Action -->|invalid| Error["Show: 'Invalid email or password.'"]
    Action -->|valid| LoggedIn
```

**UI elements:** NubleStation wordmark at top, email input, password input, "Sign in" pill button, error message area (hidden until first failed attempt), no registration or "forgot password" link (admin identity is seeded at install).

---

### `/dashboard` — Infra health

```mermaid
flowchart TD
    Page["Dashboard\n(server component)"] --> ServiceGrid["Service status grid"]
    Page --> EventFeed["Recent infra events feed"]
    Page --> Metrics["Quick metrics\n(apps count, users count, storage used)"]

    ServiceGrid --> SvcCard["Per-service card\n─────────────\nname · status badge\nuptime · last event"]

    SvcCard --> StatusOK["● Running"]
    SvcCard --> StatusWarn["● Degraded"]
    SvcCard --> StatusDown["● Down"]

    EventFeed --> EventRow["event_type · source · timestamp\n(from infra_events — last 20)"]
```

**Data sources:**
- Service status: Docker socket polling (via `GET /healthz` on each service's internal port)
- Infra events: `SELECT * FROM infra_events ORDER BY created_at DESC LIMIT 20` on `admin.db`
- Quick metrics: aggregated queries against `platform.*` tables via the db service's `/v1/admin/*` routes

Services shown: gateway, db, auth, storage, deploy, postgres, caddy, coredns.

---

### `/watch` — Live logs

```mermaid
flowchart LR
    Page["Watch page"] --> ContainerPicker["Container selector\n(dropdown)"]
    Page --> LogStream["Log stream panel\n─────────────\nscrollable, monospace\nauto-scroll toggle\nclear button"]

    ContainerPicker -->|select| SSE["SSE connection\nGET /api/logs?container=X"]
    SSE -->|event| LogStream
    SSE -->|disconnect| Reconnect["Reconnect banner"]
```

**Data source:** The console Next.js API route (`/api/logs`) connects to the Docker socket (bind-mounted into console container at `/var/run/docker.sock`) and streams `docker logs --follow --tail 100 <container>` output as SSE.

Events from services (HMAC-signed POSTs to `/internal/events`) are written to `infra_events` and surfaced here as a second tab or mixed into the stream with a `[service]` prefix badge.

**No persistence beyond `infra_events` table** — log tail is ephemeral, refreshing the page restarts from `--tail 100`.

---

### `/apps` — App registry

```mermaid
flowchart TD
    Page["Apps page\n(server component)"] --> AppList["App list\n(sorted by created_at desc)"]
    Page --> CreateBtn["+ Create app button"]

    AppList --> AppCard["App card\n─────────────\napp name · subdomain\ncreated at · status badge\nDB tables count · storage used\nactive users"]

    AppCard -->|click| AppDetail["/apps/:app"]

    CreateBtn -->|open| Modal["Create app modal\n─────────────\nApp name (slug-validated)\nDescription (optional)\n─────────────\n[Create]  [Cancel]"]

    Modal -->|submit| Action["POST /v1/admin/apps\n─────────────\ninserts platform.apps row\nissues API key\nreturns app_id + key"]

    Action -->|success| AppDetail
```

**Per-app card data** is fetched via the db service `/v1/admin/apps` route which aggregates: table count from `platform.app_tables`, storage used from `platform.apps`, user count from `platform.user_app_access`.

---

### `/apps/:app` — App detail

```mermaid
flowchart TD
    Page["App detail page\n/apps/:app"] --> Tabs["Tabs"]

    Tabs --> TabDeploy["Deployments"]
    Tabs --> TabEnvs["Envs & Secrets"]
    Tabs --> TabKeys["API Keys"]
    Tabs --> TabDB["Database"]
    Tabs --> TabMigrations["Migrations"]
    Tabs --> TabStorage["Storage"]
    Tabs --> TabUsers["Users"]

    subgraph Deploy["Deployments tab"]
        DeployList["Deployment history\n(version · status · deployed at)"]
        NewDeploy["New deployment button\n→ shows upload target\n   + API key snippet"]
    end

    subgraph Envs["Envs & Secrets tab"]
        EnvTable["Env var table\n(key · value · copy button)"]
        EnvNote["Read-only — set at app creation\nor via nuble CLI"]
    end

    subgraph Keys["API Keys tab"]
        KeyList["Key list\n(key_id · created at · last used · status)"]
        RevokeBtn["Revoke button → sets revoked_at"]
        IssueBtn["Issue new key button"]
    end

    subgraph DB["Database tab"]
        TableList["Tables owned by this app\n(table name · row count · created at)"]
        TablePreview["Schema preview (column list)"]
    end

    subgraph Migrations["Migrations tab"]
        MigList["Migration log\n(version · status · ran at · duration)"]
        MigNote["From platform.migrations — read-only"]
    end

    subgraph Storage["Storage tab"]
        FileBrowser["File browser\n(path · size · mime · uploaded at)"]
        FilePreview["Preview panel (images inline,\nothers as download link)"]
    end

    subgraph Users["Users tab"]
        UserList["Users with access\n(user_id · granted at · last seen)"]
    end

    TabDeploy --> Deploy
    TabEnvs --> Envs
    TabKeys --> Keys
    TabDB --> DB
    TabMigrations --> Migrations
    TabStorage --> Storage
    TabUsers --> Users
```

**Deployments tab** shows the platform-managed static file upload flow: developer runs `nuble deploy` → CLI POSTs the `dist/` zip → deploy service unpacks to `/var/nuble/apps/:app/` → Caddy serves it at `{appname}.{org}.local`. Console shows the status of each deployment and the endpoint URL.

**Envs & Secrets tab** surfaces the values the app developer needs to configure their SDK: the `api.{org}.local` base URL. Future: per-app environment variable store.

**API Keys tab** lists entries from `platform.api_keys WHERE app_id = :app`. Shows `key_id` and creation date — never `secret_hash`. Revoke sets `revoked_at`; issue new key returns the full `nbl_<key_id>.<secret>` string once, then it's gone. Key rotation without SSH access.

**Database tab** lists tables the app owns (from `platform.app_tables`) with row counts. No SQL editor in Phase 1 — read-only schema view only.

**Migrations tab** shows the migration history from `platform.migrations` for this app — version, status, ran at, duration. Read-only. Lets the developer debug a failed migration without SSH access.

**Storage tab** reads `/var/nuble/apps/:app/files/` directory listing (served via the storage service's `/v1/admin/storage/:app` route). Images render inline in a preview panel.

**Users tab** lists entries in `platform.user_app_access` — users who have been granted access to this app's resources.

---

### `/admins` — Admin user management

```mermaid
flowchart TD
    Page["Admins page\n(super_admin only)"] --> AdminList["Admin list\n(email · role · created at · status)"]
    Page --> InviteBtn["Invite admin button"]

    InviteBtn --> InviteModal["Invite modal\n─────────────\nEmail\nRole: admin / super_admin\n─────────────\n[Send invite]"]

    InviteModal -->|submit| Action["INSERT admin_users\n(temp password hash\nor magic-link flow)"]

    AdminList --> AdminRow["Admin row actions\n─────────────\nChange role\nRevoke access (DELETE)"]

    AdminRow -->|revoke self| Guard["Block: cannot revoke\nlast super_admin"]
```

**Access:** `super_admin` only — `admin` role gets 403. Reads/writes `admin_users` in `admin.db`. Revoking the last `super_admin` is blocked server-side. Initial admin is always the one seeded by `install.sh` and cannot be deleted.

---

### `/audit` — Platform audit log

```mermaid
flowchart TD
    Page["Audit log page"] --> Filters["Filter bar\n(admin · action type · date range)"]
    Page --> Table["Audit table\n─────────────\naction · target · admin email · timestamp"]

    Filters -->|apply| Query["SELECT * FROM platform_audit\nWHERE admin_id = ?\nAND created_at BETWEEN ? AND ?\nORDER BY created_at DESC\nLIMIT 100"]

    Query --> Table
```

**Data source:** `platform_audit` in `admin.db` — append-only, written by the console on every mutating action (app created, admin invited, key revoked, deployment triggered, etc.). No delete or edit of audit rows — ever. Exportable as CSV for compliance handoff.

---

### `/settings` — Org + platform config

```mermaid
flowchart TD
    Page["Settings page\n(super_admin only)"] --> OrgSection["Org info section\n─────────────\nName (editable)\nDescription (editable)\n[Save changes]"]

    Page --> NetworkSection["Network section\n─────────────\nOrg domain (read-only, set at install)\nHost IP (read-only)\nCaddy TLS status badge"]

    Page --> SecretSection["Secrets section\n─────────────\nHMAC secret last rotated: <date>\n[Rotate secret] button"]

    SecretSection -->|click rotate| RotateModal["Confirm rotation modal\n─────────────\n'This will invalidate all in-flight\nrequests. Services will restart.'\n[Rotate]  [Cancel]"]

    RotateModal -->|confirm| RotateAction["Generate new INTERNAL_HMAC_SECRET\nWrite to .env\nSIGHUP all service containers"]
```

**Access:** `super_admin` only. Org name/description writes to `organization` in `admin.db`. HMAC secret rotation rewrites the shared secret and sends SIGHUP to all service containers — brief (~2s) interruption. Network fields are read-only post-install (changing domain requires reinstall).

---

### `/network` — Topology view

```mermaid
flowchart TD
    Page["Network page"] --> DNSSection["DNS section\n─────────────\nZone: *.{org}.local\nResolver: CoreDNS :53\nHost IP: {ip}\nRegistered subdomains table"]

    Page --> CaddySection["Caddy section\n─────────────\nUpstream map: subdomain → container\nTLS: auto / off\nActive connections count"]

    Page --> SubdomainTable["Subdomain table\n─────────────\n{org}.local → console\napi.{org}.local → gateway\n{app}.{org}.local → static files\n(one row per registered app)"]

    DNSSection --> DNSBadge["● Resolving / ● Not resolving\n(probe via fetch to /healthz)"]
    CaddySection --> CaddyBadge["● Reachable / ● Unreachable"]
```

**Data source:** subdomain table is built from `platform.apps` (one row per app) + hardcoded system subdomains (console, api). DNS and Caddy badges are live probes — not polled, fetched on page load. No editing — topology is determined by `install.sh` and app creation.

---

### `/storage` — Org-wide disk usage

```mermaid
flowchart TD
    Page["Storage page"] --> Summary["Summary bar\n─────────────\nTotal used · Free · % bar"]

    Page --> PerAppTable["Per-app breakdown table\n─────────────\nApp name · files count · size · last upload"]

    Page --> LargestFiles["Largest files list\n(top 20 across all apps)\nfile path · app · size · mime"]

    PerAppTable -->|click row| AppDetail["/apps/:app (Storage tab)"]
```

**Data source:** storage service's `/v1/admin/storage` route which walks `/var/nuble/apps/` on the host filesystem. Summary bar uses `df` output for actual disk free vs. used. Clicking a row navigates to the app's storage tab for file-level browsing.
