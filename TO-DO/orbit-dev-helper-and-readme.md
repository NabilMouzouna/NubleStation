# Orbit — Dev helper + README (M5.7)

> A small TypeScript script that signs requests the way the gateway will, so you can test Orbit end-to-end on Mac with just `curl`. Plus the README that ties M5 together for future-you.

## Goal

`pnpm --filter @nublestation/orbit exec tsx scripts/sign-and-curl.ts <slug> <zip-path>` prints a ready-to-paste `curl` command that uploads the zip with a valid HMAC sig. A `--rollback` flag prints the rollback equivalent. The README walks through the full Mac flow.

## Files to create

```
apps/orbit/
├── scripts/
│   └── sign-and-curl.ts
└── README.md                  (replaces the placeholder from orbit-scaffold)
```

## sign-and-curl.ts

Reads `INTERNAL_HMAC_SECRET` from `.env.local`, accepts CLI args:

```sh
# upload mode
tsx scripts/sign-and-curl.ts <slug> <zip-path> [--port 3004]

# rollback mode
tsx scripts/sign-and-curl.ts <slug> --rollback [--port 3004]
```

Output (upload mode): a single curl command, e.g.

```sh
curl -X POST http://localhost:3004/v1/upload \
  -H "X-Nuble-App-Id: 00000000-0000-0000-0000-000000000001" \
  -H "X-Nuble-App-Slug: tasks" \
  -H "X-Nuble-User-Id: 00000000-0000-0000-0000-000000000002" \
  -H "X-Nuble-Timestamp: 1716134400000" \
  -H "X-Nuble-Sig: ab4c..." \
  -F "file=@/tmp/hello.zip"
```

Implementation sketch:

```ts
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { config as loadDotenv } from 'dotenv'
import { computeHmac } from '@nublestation/shared'

loadDotenv({ path: '.env.local' })

const slug = process.argv[2]
const rollback = process.argv.includes('--rollback')
const zipPath = !rollback ? process.argv[3] : null
const port = Number(process.argv[process.argv.indexOf('--port') + 1] ?? 3004)

const method = 'POST'
const path = rollback ? '/v1/rollback' : '/v1/upload'
const timestamp = String(Date.now())
const appId  = '00000000-0000-0000-0000-000000000001'  // placeholder for Mac dev
const userId = '00000000-0000-0000-0000-000000000002'  // placeholder for Mac dev

// Body hash:
//   upload mode  → SHA-256 of the raw multipart body (we approximate by hashing the zip file directly)
//                  CAVEAT: real multipart wraps the file in MIME headers; this means the sig you
//                  print here matches the BODY hash Orbit will see ONLY if curl's -F produces the
//                  exact same boundary you assume. The cleaner approach below sidesteps this.
//   rollback mode → SHA-256 of an empty string

// Cleaner approach: have the dev helper print TWO commands —
//   1. A precompute step that writes the multipart body to /tmp/orbit-curl-body and computes its hash
//   2. The curl command using --data-binary @/tmp/orbit-curl-body with the matching sig
// OR
//   Compute the sig over a NORMALIZED body (e.g. raw zip bytes) and have Orbit's HMAC middleware
//   recompute body hash from the SAME normalized form. That couples too much.
//
// SIMPLEST PRACTICAL APPROACH FOR DEV:
//   Have Orbit's HMAC middleware accept an alternative dev-mode signature scheme behind a flag
//   (NUBLE_DEV_MODE=true) that hashes the file bytes instead of the multipart wrapper. Document
//   this loudly as a Mac-only convenience.

// PICK ONE BEFORE IMPLEMENTING — see "Decision: dev-mode HMAC" below.
```

### Decision: dev-mode HMAC

Multipart body hashing is fiddly because the boundary is random per request. Two paths:

**Path A — Build the multipart body manually in the helper.** Construct the body in the script, write it to `/tmp/orbit-curl-body`, hash that, and print the curl with `--data-binary @/tmp/orbit-curl-body -H "Content-Type: multipart/form-data; boundary=..."`. Works without any Orbit code change. **Recommended.**

**Path B — Add a dev-mode HMAC variant.** Pass an env flag that tells Orbit to hash the uploaded file bytes after multipart parsing instead of the raw body. Easier to write but means production code carries dev-only branches.

**Pick Path A.** It costs ~30 lines in the helper script and leaves Orbit's production code uncompromised. Use a fixed boundary like `----orbit-dev` so the body is reproducible:

```
------orbit-dev
Content-Disposition: form-data; name="file"; filename="hello.zip"
Content-Type: application/zip

<raw zip bytes>
------orbit-dev--
```

Hash that whole byte sequence with SHA-256, sign it, and the curl command uses the same boundary. Reproducible end-to-end.

## README.md

Full Mac walkthrough — replaces the scaffold placeholder. Suggested sections:

1. **What is Orbit** — one paragraph: takes a zip, drops it on disk, swaps it in.
2. **Mac dev setup** — Postgres NOT required (Orbit doesn't touch Postgres in M5). Just `~/.nuble-dev/apps` and `.env.local`.
3. **Run the service** — `pnpm orbit:dev`. Health/ready endpoints.
4. **Deploy a sample zip without gateway/CLI** — the dev-helper flow end-to-end.
5. **Rollback** — second `--rollback` invocation.
6. **Testing** — `pnpm orbit:test`. Vitest sandbox.
7. **Mac → Docker swap** — `NUBLE_APPS_DIR` env var changes; nothing else.
8. **What's NOT in M5** — Blaze deployment record write, CLI integration, console wiring.

Match the style of `apps/blaze/README.md` so the cognitive load of switching between them is minimal.

## Acceptance

End-to-end flow from a cold start works:

```sh
mkdir -p ~/.nuble-dev/apps
cp .env.example .env.local && edit .env.local   # set NUBLE_APPS_DIR + secret
pnpm orbit:dev

# in another terminal:
mkdir -p /tmp/v1 && echo '<h1>v1</h1>' > /tmp/v1/index.html
(cd /tmp/v1 && zip -r ../v1.zip .)
pnpm --filter @nublestation/orbit exec tsx scripts/sign-and-curl.ts tasks /tmp/v1.zip | bash

cat ~/.nuble-dev/apps/tasks/current/index.html   # → <h1>v1</h1>
```

The README is good if a teammate following only its instructions can reach the same outcome.

## References

- Path A multipart hashing pattern: HTTP multipart RFC 7578 §4
- `packages/shared/src/hmac.ts` (extended in [[orbit-hmac-middleware]])
- `apps/blaze/README.md` — style reference for the README
