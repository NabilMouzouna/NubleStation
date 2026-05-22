# Orbit — Rollback route (M5.6)

> `POST /v1/rollback` promotes `.previous/` back to `current/`, demoting the current build to `.previous/`. Manual trigger only — auto-rollback (health-check-driven) is v1.5.

## Goal

A signed HTTP call rolls back the targeted app to its previous build. Idempotent within reason: calling rollback twice returns the user to where they started.

## File to create

```
apps/orbit/src/routes/rollback.ts
```

Wire into `apps/orbit/src/server.ts` next to the upload route.

## Algorithm

```
1. HMAC middleware ran — c.var.appSlug is trusted
2. result = await rollback(NUBLE_APPS_DIR, c.var.appSlug)   // from swap.ts
3. Return 200:
   {
     "app": c.var.appSlug,
     "rolledBackAt": new Date().toISOString(),
     "promotedFrom": ".previous"
   }
```

## Errors

| Caught | Status | Body |
|---|---|---|
| `NoRollbackAvailableError` | 404 | `{ error: "no_rollback_available" }` |
| `RollbackInProgressError` | 409 | `{ error: "rollback_in_progress" }` (sweeper will recover at next boot; log loudly) |
| `Error` (other) | 500 | `{ error: "rollback_failed" }` |

## Notes

- This route does **not** call Blaze in M5. In M8 we'll add a `platform.deployments` row with `status='rolled_back'` referencing the prior deployment. For now, the on-disk swap is the entire effect.
- No body required (or accept and ignore). HMAC payload includes method/path/empty-body-hash/timestamp/appSlug — same shape as upload, just zero-byte body.

## Tests

`apps/orbit/test/rollback.test.ts`:

- with no prior deploy → 404
- after one deploy → 404 (no `.previous/` yet — first deploy created only `current/`)
- after two deploys → 200, `current/` contents flip to v1
- after rollback, calling rollback again → 200, `current/` contents flip back to v2 (symmetric)
- HMAC failures → 401 (same as upload route)

## Console wiring (M10, not now)

The console's `/apps/:app` Deployments tab will surface a "Rollback" button next to each deployment after the current one. It hits Orbit through the gateway. Out of scope for this task.

## Acceptance

`pnpm orbit:test` passes. Manual on Mac:

```sh
# after deploying v1 then v2 (from the upload route task)
# use the dev helper to sign a rollback call
pnpm --filter @nublestation/orbit exec tsx scripts/sign-and-curl.ts tasks --rollback
cat ~/.nuble-dev/apps/tasks/current/index.html
# → <h1>v1</h1>  (rolled back)
```

## References

- `docs/adr/007-deployment-service.md` §10 — rollback algorithm + auto-rollback deferral
- `apps/orbit/src/deploy/swap.ts` from [[orbit-atomic-swap]]
