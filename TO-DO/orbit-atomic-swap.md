# Orbit — Atomic swap (M5.4)

> The filesystem dance that promotes a successfully extracted `.incoming-{ts}/` to be the live `current/`, retaining the prior `current/` as the one-step rollback bin `.previous/`.

## Goal

`swapInCurrent(appsRoot, slug, incomingPath)` performs the atomic-ish promotion and leaves the previous build accessible via `.previous/`. A separate function `rollback(appsRoot, slug)` performs the reverse swap.

## File to create

```
apps/orbit/src/deploy/swap.ts
```

## API

```ts
// apps/orbit/src/deploy/swap.ts

export async function swapInCurrent(
  appsRoot: string,
  slug: string,
  incomingPath: string,
): Promise<void>

export async function rollback(
  appsRoot: string,
  slug: string,
): Promise<{ promotedFrom: string }>
```

## swapInCurrent algorithm

```
1. cur  = currentDir(appsRoot, slug)
2. prev = previousDir(appsRoot, slug)
3. if cur exists:
     3a. if prev exists: await fs.rm(prev, { recursive: true, force: true })
     3b. await fs.rename(cur, prev)
4. await fs.rename(incomingPath, cur)
```

If step 4 throws (extremely rare — same filesystem, both paths in same dir), the function:
- attempts to restore by renaming `prev` back to `cur` (best effort)
- re-throws the original error

Note the gap between 3b and 4 is sub-millisecond on a local FS. We accept the rare 404 during that window — better than locking semantics that don't exist portably.

## rollback algorithm

```
1. cur     = currentDir(appsRoot, slug)
2. prev    = previousDir(appsRoot, slug)
3. swapTmp = path.join(appDir(appsRoot, slug), '.swap-tmp')
4. if !exists(prev) → throw NoRollbackAvailableError
5. if exists(swapTmp) → throw RollbackInProgressError  (crash recovery state)
6. await fs.rename(cur, swapTmp)
7. await fs.rename(prev, cur)
8. await fs.rename(swapTmp, prev)
```

After step 8: `current/` is what `.previous/` was, and `.previous/` is what `current/` was. The user can roll back again to undo.

## Startup sweeper

Add to `apps/orbit/src/index.ts` before `serve()`:

```ts
async function sweepOrphans(appsRoot: string) {
  // For each {slug}/ in appsRoot:
  //   remove every .incoming-* directory
  //   if .swap-tmp exists, log a warning (manual recovery needed — partial rollback)
}
```

Run once at boot. Pino-log how many orphans were removed.

## Tests

`apps/orbit/test/swap.test.ts`:

- first deploy (no `current/`, no `.previous/`): incoming → current; no `.previous/` exists yet
- second deploy (`current/` exists, no `.previous/`): old current → `.previous/`; incoming → current
- third deploy (`current/` and `.previous/` exist): old `.previous/` removed, old current → `.previous/`, incoming → current
- rollback after one deploy: throws `NoRollbackAvailableError`
- rollback after two deploys: contents swap; rolling back again returns to second deploy
- sweepOrphans removes orphaned `.incoming-1234567890` directory

Use `tmpdir` for each test, populate with `fs.writeFile` to simulate files.

## Acceptance

`pnpm orbit:test` passes. Manually verify on Mac with two real zips:

```sh
# build two test zips with different index.html content
mkdir -p /tmp/v1 /tmp/v2
echo '<h1>v1</h1>' > /tmp/v1/index.html
echo '<h1>v2</h1>' > /tmp/v2/index.html
(cd /tmp/v1 && zip -r ../v1.zip .)
(cd /tmp/v2 && zip -r ../v2.zip .)

# after upload route is wired, deploy v1, deploy v2, rollback
# verify ~/.nuble-dev/apps/tasks/current/index.html flips
```

## Out of scope

- HTTP route → [[orbit-upload-route]], [[orbit-rollback]]
- Rolling back when source is missing → handled by NoRollbackAvailableError, surfaced as 404

## References

- `docs/adr/007-deployment-service.md` §4 (deploy algorithm), §10 (rollback algorithm)
