# From `install.sh` to Console — Under the Hood

This document traces the complete path from a single `curl | bash` command to a working NubleStation console accessible in a browser on the LAN. Every step is explained with the reasoning behind it.

---

## The Big Picture

Before diving into steps, here is the full topology that `install.sh` builds and that every subsequent request flows through.

```mermaid
graph TB
    subgraph LAN["Local Area Network"]
        Browser["🖥️ Browser\nclinic device"]
        Router["📡 Router\nDHCP + DNS forward"]
    end

    subgraph Host["NubleStation Host Machine (Ubuntu)"]
        HostIP["Host IP: 192.168.1.100"]
        AdminDB["/var/nuble/admin.db\nSQLite — identity store"]
        Files["/var/nuble/apps/\nStatic frontend files"]
        DockerSock["/var/run/docker.sock"]

        subgraph Docker["Docker Compose Stack"]
            Caddy["Caddy :80/:443\nReverse proxy"]
            CoreDNS["CoreDNS :53\nDNS authority"]
            Gateway["API Gateway :3000"]
            Console["Console (Next.js) :80"]
            DB["DB Service :3001"]
            Auth["Auth Service :3002"]
            Storage["Storage :3003"]
            Deploy["Deploy :3004"]
            Postgres["PostgreSQL :5432"]
        end
    end

    Browser -->|"DNS query *.clinic.local"| Router
    Router -->|"forward to 192.168.1.100:53"| CoreDNS
    CoreDNS -->|"→ 192.168.1.100"| Browser
    Browser -->|"HTTP :80"| Caddy
    Caddy -->|"console.clinic.local"| Console
    Caddy -->|"api.clinic.local"| Gateway
    Caddy -->|"tasks.clinic.local"| Files

    Console -.->|"bind mount :rw"| AdminDB
    Console -.->|"bind mount :ro"| DockerSock
    Gateway --> DB
    Gateway --> Auth
    Gateway --> Storage
    Gateway --> Deploy
    DB --> Postgres
```

---

## Phase 1 — `install.sh` Executes

Everything starts with one command on the host machine:

```bash
curl -sSL https://get.nublestation.io/install.sh | bash
```

### What the script does, in order

```mermaid
flowchart TD
    A["curl -sSL .../install.sh | bash"] --> B["Display ANSI logo + version banner"]
    B --> C{"Already installed?\nCheck /var/nuble/.nuble-version"}
    C -->|"Yes"| D["Show: Upgrade / Reset password\n/ Reinstall / Exit menu"]
    C -->|"No"| E["Detect package manager\napt / dnf / pacman"]
    E --> F["Install missing deps\nDocker · sqlite3 · whiptail"]
    F --> G["Prompt: Org name\nPrompt: Admin email\nPrompt: Admin password ×2"]
    G --> H["Download release bundle\ndocker-compose.yml\nseed-admin.sql\nCaddyfile · Corefile.template"]
    H --> I["Generate secrets\nopenssl rand -hex 32\n→ INTERNAL_HMAC_SECRET"]
    I --> J["Generate .env\nORG_NAME · ORG_DOMAIN\nHMAC secret · ports"]
    J --> K["Generate CoreDNS Corefile\nfrom template + ORG_DOMAIN + host IP"]
    K --> L["Create /var/nuble/\ndirectory structure"]
    L --> M["Create admin.db\nsqlite3 < seed-admin.sql"]
    M --> N["Hash password with Argon2\nvia temporary Docker container"]
    N --> O["Insert org + super_admin row\ninto admin.db"]
    O --> P["Write /var/nuble/.nuble-version"]
    P --> Q["docker compose up -d"]
    Q --> R["Health check loop\n30s timeout per service"]
    R -->|"All healthy"| S["✅ Success banner\nhttp://console.clinic.local"]
    R -->|"Timeout"| T["❌ Print container logs\n+ manual recovery steps"]
```

### Checkpoint system

The script writes a checkpoint file at `/var/nuble/.install-checkpoint` after each major step. If it crashes midway, re-running it reads the checkpoint and resumes from where it left off — no starting over from scratch.

```
1. deps-checked      ← Docker, sqlite3, uuidgen verified
2. files-downloaded  ← Bundle pulled from GitHub
3. env-generated     ← .env written
4. db-created        ← admin.db created and seeded
5. compose-started   ← docker compose up -d succeeded
6. health-verified   ← all containers healthy ← file deleted here
```

---

## Phase 2 — SQLite Bootstrap (`admin.db`)

This is the most important step that runs **before any Docker container starts**. The console needs a pre-existing identity store to authenticate admins — it cannot bootstrap itself.

```mermaid
sequenceDiagram
    participant S as install.sh
    participant SQ as sqlite3 CLI
    participant DB as /var/nuble/admin.db
    participant D as Docker (temp container)

    S->>SQ: sqlite3 /var/nuble/admin.db < seed-admin.sql
    SQ->>DB: CREATE TABLE organization
    SQ->>DB: CREATE TABLE admin_users
    SQ->>DB: CREATE TABLE admin_sessions
    SQ->>DB: CREATE TABLE infra_events
    SQ->>DB: CREATE TABLE platform_audit
    SQ->>DB: CREATE TABLE schema_version
    SQ->>DB: INSERT schema_version (version=1)

    Note over S,D: Password hashing — no Node.js on host needed

    S->>D: docker run --rm node:22-alpine\n  -e "node -e require('@node-rs/argon2')...hash(password)""
    D-->>S: $2id$... (Argon2id hash string)

    S->>SQ: INSERT INTO organization VALUES (...)
    S->>SQ: INSERT INTO admin_users VALUES (..., hash, 'super_admin')
    SQ->>DB: Rows committed

    Note over DB: admin.db is complete before docker compose up
```

### Why SQLite and not PostgreSQL?

| Question | PostgreSQL | SQLite (`admin.db`) |
|---|---|---|
| Exists before Docker starts? | No — it is a container | Yes — `install.sh` creates it on the host |
| Console works if Postgres is down? | No — auth blocked | Yes — fully independent |
| Super admin locked out during incident? | Possible | Never |
| Backup | Part of `pg_dump` | `cp /var/nuble/admin.db backup/` |

Platform admins are not tenants. They manage the infrastructure. Their identity lives separately from app data — by design.

---

## Phase 3 — Docker Compose Boot Sequence

Once `admin.db` exists, `docker compose up -d` starts all containers. They do not all start at the same time — Docker respects `depends_on` + `healthcheck` ordering.

```mermaid
sequenceDiagram
    participant C as docker compose
    participant PG as PostgreSQL
    participant PB as PgBouncer
    participant DB as DB Service
    participant GW as Gateway
    participant Con as Console
    participant Cad as Caddy
    participant DNS as CoreDNS

    C->>PG: start postgres
    C->>DNS: start coredns
    C->>Cad: start caddy

    PG-->>C: healthy (pg_isready)

    C->>PB: start pgbouncer (depends: postgres healthy)
    PB-->>C: healthy

    C->>DB: start db service (depends: pgbouncer healthy)
    Note over DB: Boot sequence inside container:
    DB->>DB: loadConfig() — zod validate env
    DB->>PG: runPlatformMigrations() via drizzle
    DB->>PG: recordSchemaVersion()
    DB-->>C: healthy (GET /healthz → 200)

    C->>GW: start gateway (depends: db healthy)
    GW->>PG: open read-only pool (api_keys lookup)
    GW-->>C: healthy

    C->>Con: start console (depends: gateway healthy)
    Note over Con: Boot sequence inside container:
    Con->>Con: open /app/admin.db (better-sqlite3)
    Con->>Con: PRAGMA journal_mode=WAL
    Con->>Con: PRAGMA foreign_keys=ON
    Con->>Con: check schema_version row
    Con->>Con: apply pending SQLite migrations (if any)
    Con-->>C: healthy (Next.js server ready)

    Note over C: All 8 services healthy — install.sh prints success banner
```

### What the bind mounts look like

```
Host filesystem                    Inside containers
─────────────────                  ─────────────────
/var/nuble/admin.db    ──────────► /app/admin.db          (console, rw)
/var/run/docker.sock   ──────────► /var/run/docker.sock   (console, ro)
/var/nuble/apps/       ──────────► /var/nuble/apps/        (deploy, rw)
                                   /var/nuble/apps/        (caddy, ro — static files)
```

---

## Phase 4 — DNS Resolution on the LAN

For any device on the network to reach `console.clinic.local`, DNS must work. CoreDNS handles this entirely.

```mermaid
sequenceDiagram
    participant D as Nurse's tablet
    participant R as Router (DNS: 192.168.1.100)
    participant CD as CoreDNS :53 (on host)
    participant H as Host 192.168.1.100

    D->>R: DNS query: console.clinic.local?
    Note over R: Router is configured to forward\n*.local queries to 192.168.1.100

    R->>CD: forward query to 192.168.1.100:53
    CD->>CD: match zone: *.clinic.local
    CD-->>R: A record → 192.168.1.100
    R-->>D: 192.168.1.100

    D->>H: HTTP GET console.clinic.local :80
    Note over H: Caddy is listening on :80
```

### CoreDNS Corefile (generated by install.sh)

```
clinic.local {
    hosts {
        192.168.1.100 console.clinic.local
        192.168.1.100 api.clinic.local
        192.168.1.100 *.clinic.local
        fallthrough
    }
    forward . 1.1.1.1 8.8.8.8
    log
    errors
}
```

Every subdomain — whether system (`console`, `api`) or app (`tasks`, `patients`) — resolves to the single host IP. Caddy then routes by hostname.

---

## Phase 5 — HTTP Request Flow Through Caddy

After DNS resolves, the HTTP request hits port 80 on the host. Caddy intercepts it.

```mermaid
flowchart TD
    Req["Browser: GET console.clinic.local"]
    Caddy{"Caddy\nmatch by hostname"}

    Req --> Caddy

    Caddy -->|"console.clinic.local"| Console["→ reverse_proxy console:80\n(Next.js)"]
    Caddy -->|"api.clinic.local"| Gateway["→ reverse_proxy gateway:3000\n(API Gateway)"]
    Caddy -->|"tasks.clinic.local"| Static["→ file_server\n/var/nuble/apps/tasks/current/\n(static HTML/CSS/JS)"]
    Caddy -->|"patients.clinic.local"| Static2["→ file_server\n/var/nuble/apps/patients/current/"]

    Console --> NextJS["Next.js App Router\n(running in console container)"]
    Gateway --> Services["Internal services\ndb · auth · storage · deploy"]
```

### Caddyfile structure

```
# System routes — proxied to containers
console.clinic.local {
    reverse_proxy console:80
}

api.clinic.local {
    reverse_proxy gateway:3000
}

# App routes — served from filesystem
*.clinic.local {
    @notSystem not host console.clinic.local api.clinic.local
    handle @notSystem {
        root * /var/nuble/apps/{labels.1}/current
        file_server
        try_files {path} /index.html
    }
}
```

The `try_files … /index.html` fallback is what makes React Router and Vue Router work — unknown paths fall back to the SPA entry point instead of 404ing.

---

## Phase 6 — Console Boot (Inside the Container)

When the console container starts, Next.js performs its own initialization before accepting any request.

```mermaid
flowchart TD
    Start["Container starts\n(Next.js process)"] --> OpenDB["Open /app/admin.db\nbetter-sqlite3 — synchronous"]
    OpenDB --> Pragma["PRAGMA journal_mode = WAL\nPRAGMA foreign_keys = ON"]
    Pragma --> CheckVersion["SELECT version FROM schema_version"]
    CheckVersion --> Compare{"schema_version\n= expected?"}
    Compare -->|"Up to date"| Serve["Next.js ready\naccept requests"]
    Compare -->|"Outdated"| Migrate["Apply pending SQLite\nmigration scripts"]
    Migrate --> Serve
```

**Why `better-sqlite3` (synchronous)?**
Next.js server components run in a Node.js environment where synchronous SQLite reads are fast (microseconds for a local file) and safe. No async overhead, no connection pool, no network. The database is a file on the same filesystem as the process.

---

## Phase 7 — First Login (Auth Flow)

The super admin opens `console.clinic.local` for the first time. No session cookie exists yet.

```mermaid
sequenceDiagram
    participant B as Browser
    participant MW as Next.js Middleware\n(Edge runtime)
    participant SC as Server Component\n(/auth/page.tsx)
    participant SA as Server Action\n(login())
    participant DB as admin.db (SQLite)

    B->>MW: GET /dashboard
    Note over MW: Middleware runs on Edge runtime\ncannot use better-sqlite3 (native binary)
    MW->>MW: req.cookies.get("nuble_session") → null
    MW-->>B: 307 redirect → /auth

    B->>SC: GET /auth
    SC->>DB: validateSession() → null (no cookie)
    SC-->>B: Render login form

    B->>SA: POST /auth (formData: email + password)
    SA->>DB: SELECT id, password_hash FROM admin_users\nWHERE email = ?
    DB-->>SA: { id, password_hash }
    SA->>SA: argon2.verify(hash, password)

    alt Wrong password or unknown email
        SA-->>B: { error: "Invalid email or password." }
        Note over B: Error shown — no redirect
    else Valid credentials
        SA->>DB: INSERT INTO admin_sessions\n(id, admin_id, expires_at, created_at)
        SA->>SA: cookies().set("nuble_session", sessionId,\n{ httpOnly, sameSite:lax, 7 days })
        SA-->>B: redirect("/dashboard")
    end
```

### Security properties of this flow

| Property | How enforced |
|---|---|
| Password never stored plaintext | Argon2id hash stored, plaintext discarded after `install.sh` |
| Timing-safe comparison | `argon2.verify()` is constant-time |
| Username enumeration prevention | Same error for "not found" and "wrong password" |
| Session ID unguessable | `crypto.randomBytes(32).toString("hex")` = 256 bits of entropy |
| Session cookie not accessible to JS | `httpOnly: true` |
| CSRF protection | `sameSite: lax` — cookie not sent on cross-site POSTs |
| Session expires | `expires_at` stored in DB, validated on every request |

---

## Phase 8 — Every Subsequent Request (Session Validation)

After login, every protected route goes through a two-layer check.

```mermaid
flowchart TD
    Req["Browser: GET /dashboard\n(cookie: nuble_session=abc123...)"]

    MW["Middleware\n(Edge runtime)"]
    Req --> MW

    MW --> CookieCheck{"Cookie\npresent?"}
    CookieCheck -->|"No"| RedirectAuth["307 → /auth"]
    CookieCheck -->|"Yes"| Next["NextResponse.next()\npass to server component"]

    Next --> SC["Server Component\n(/dashboard/page.tsx)"]
    SC --> ValidateSession["validateSession()\nbetter-sqlite3"]

    ValidateSession --> DBQuery["SELECT s.*, u.*\nFROM admin_sessions s\nJOIN admin_users u ON u.id = s.admin_id\nWHERE s.id = ? AND s.expires_at > ?"]

    DBQuery --> ValidCheck{"Row\nreturned?"}
    ValidCheck -->|"No (expired or invalid)"| RedirectAuth2["redirect('/auth')"]
    ValidCheck -->|"Yes"| Render["Render dashboard\nwith admin context"]
```

**Why two layers?**

The Edge runtime (middleware) cannot load native binaries — `better-sqlite3` compiles to a `.node` file that only runs in Node.js. So middleware can only check cookie *presence*. The full validity check (expiry, DB lookup, user still exists) happens inside the server component where the full Node.js runtime is available. If a cookie exists but the session has expired or been revoked, the server component catches it and redirects.

---

## Phase 9 — Two-Layer Observability

Once running, the console monitors the service layer through two independent channels so it always has an accurate picture regardless of service health.

```mermaid
graph LR
    subgraph Layer A ["Layer A — Docker socket polling (safety net)"]
        DockerSock["/var/run/docker.sock\n(bind mount, read-only)"]
        ConsoleA["Console\nserver component"]
        DockerSock -->|"container status\nrestart count\nexit code\nOOM events"| ConsoleA
    end

    subgraph Layer B ["Layer B — Service event push (detail layer)"]
        GW["Gateway"]
        DB["DB Service"]
        Auth["Auth Service"]
        ConsoleB["Console\nPOST /internal/events"]
        InfraEvents["infra_events table\n(admin.db)"]

        GW -->|"HMAC-signed POST"| ConsoleB
        DB -->|"HMAC-signed POST"| ConsoleB
        Auth -->|"HMAC-signed POST"| ConsoleB
        ConsoleB --> InfraEvents
    end
```

### Layer A — Docker socket

The console container mounts `/var/run/docker.sock` read-only. Server components call the Docker API directly:

```
GET /containers/json
GET /containers/{id}/json
GET /containers/{id}/logs?tail=100&follow=true
```

This works even when every service is crashed — the Docker daemon is always running on the host and always knows the container state.

### Layer B — Service event push

When services are healthy, they fire-and-forget structured events:

```
POST http://console/internal/events
X-Nuble-Sig: <HMAC-SHA256 of payload using INTERNAL_HMAC_SECRET>

{
  "source": "db",
  "event_type": "migration.ran",
  "payload": { "version": "0003", "duration_ms": 42 }
}
```

The console verifies the HMAC before writing to `infra_events`. Unsigned requests are silently dropped. Services never retry — if the console is unreachable, the event is lost (that is acceptable; Layer A covers the gap).

---

## Full Timeline — Zero to Console

```mermaid
timeline
    title NubleStation install timeline
    section install.sh
        t=0s  : curl | bash starts
        t=5s  : Dependencies verified / installed
        t=15s : Admin prompts completed
        t=20s : Bundle downloaded from GitHub
        t=22s : .env + CoreDNS Corefile generated
        t=24s : /var/nuble/admin.db created and seeded
        t=30s : docker compose up -d launched
    section Docker boot
        t=35s : PostgreSQL healthy
        t=38s : PgBouncer healthy
        t=45s : DB service healthy (migrations ran)
        t=50s : Gateway healthy
        t=55s : Console healthy (SQLite schema checked)
        t=60s : Caddy + CoreDNS healthy
    section First use
        t=65s : install.sh prints success banner
        t=70s : Admin opens console.clinic.local in browser
        t=72s : DNS resolves via CoreDNS → 192.168.1.100
        t=73s : Caddy forwards to console container
        t=74s : Login form rendered
        t=76s : Admin submits credentials
        t=77s : Argon2 verify passes — session created
        t=78s : Dashboard loads ✅
```

---

## What Can Go Wrong and How It Recovers

| Failure point | Symptom | Recovery |
|---|---|---|
| Docker not installed | install.sh exits at step 1 | Script auto-installs via apt/dnf/pacman |
| GitHub download fails | Bundle missing | Retry 3× with backoff |
| admin.db seed fails | Blank DB | Drop and recreate (idempotent) |
| docker compose fails | Containers not starting | `compose down` + retry once; print logs on second failure |
| Container unhealthy after boot | Health check timeout | Print specific container logs + docs link |
| Console can't open admin.db | 500 on every request | Check bind mount path in docker-compose.yml |
| CoreDNS not reached by devices | `*.clinic.local` doesn't resolve | Router DNS must point to host IP — shown in success banner |
| Session expired | Redirect to /auth | Re-login; sessions last 7 days |
| Service crashes after install | Dashboard shows "Down" badge | Layer A (Docker socket) detects it; Layer B events stop |
