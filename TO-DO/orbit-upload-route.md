# Orbit — Upload route (M5.5)

> Wires HMAC middleware, multipart streaming, zip extraction, and atomic swap into one HTTP route. After this milestone, Orbit accepts a real zip upload from `curl` (signed manually) and the file lands in `current/`.

## Goal

`POST /v1/upload` accepts a streaming multipart body whose `file` field is a zip, extracts it to `.incoming-{ts}/`, and atomically promotes it to `current/`. Returns deployment metadata as JSON.

## File to create

```
apps/orbit/src/routes/upload.ts
```

Wire into `apps/orbit/src/server.ts` after the HMAC middleware.

## Dependency

```
busboy ^1
@types/busboy ^1  (devDep)
```

## Algorithm

```
1. HMAC middleware already verified the request (skipped if !sig)
   → c.var.appId, c.var.appSlug, c.var.userId are trusted
2. const slug = c.var.appSlug
3. const ts = Date.now()
4. const tmpZipPath = path.join(os.tmpdir(), `orbit-upload-${randomUUID()}.zip`)
5. const incomingPath = incomingDir(NUBLE_APPS_DIR, slug, ts)
6. await fs.mkdir(incomingPath, { recursive: true })

7. Parse multipart with busboy:
   - on('file', (name, fileStream, info)):
       if name !== 'file' → fileStream.resume(); skip
       if too many file fields → reject
       pipe fileStream into fs.createWriteStream(tmpZipPath)
   - on('error', err) → reject
   - on('close') → resolve once busboy and the write stream both close

8. Validate uploaded size (stat tmpZipPath); if > MAX_UPLOAD_SIZE_MB * 1024² → 413, cleanup, return
9. Open tmpZipPath with yauzl, stream-extract into incomingPath
   (calls extractZipStream from extract.ts)
10. fs.rm(tmpZipPath, force: true)  — always, even on error (use try/finally)

11. swapInCurrent(NUBLE_APPS_DIR, slug, incomingPath)
12. (M8) POST to Blaze /v1/admin/deployments — stubbed in M5 as a comment
13. Return JSON:
    {
      "deploymentId": <ulid from step 3 or randomUUID>,
      "app": slug,
      "files": result.files,
      "sizeBytes": result.totalBytes,
      "extractedTo": currentDir(...),
      "durationMs": Date.now() - ts
    }
```

### Error handling (try/catch around the whole flow)

| Caught | Action |
|---|---|
| `ZipSlipError` | 400 `zip_slip`, cleanup tmpZip + incomingPath |
| `MissingIndexHtmlError` | 400 `missing_index_html`, cleanup |
| `OverSizeError` | 413 `too_large`, cleanup |
| `InvalidZipError` | 422 `invalid_zip`, cleanup |
| `Error` (anything else) | 500 `extract_failed`, cleanup, log full stack via Pino |

"Cleanup" = `fs.rm` both `tmpZipPath` and `incomingPath` with `{ recursive: true, force: true }`.

### Content-Length pre-check

Before reading any bytes, if `c.req.header('content-length')` exists and exceeds `MAX_UPLOAD_SIZE_MB * 1024 * 1024`, return 413 immediately — don't even parse the multipart. This protects against a client streaming gigabytes before we hit the post-write size check.

## How to test on Mac without gateway or CLI

This is the M5 acceptance check. The `sign-and-curl` helper task ([[orbit-dev-helper-and-readme]]) gives you a script that:

1. Computes the HMAC sig for a given zip + slug + timestamp.
2. Prints a ready-to-run `curl` command.

Manually:

```sh
# build a sample zip
mkdir -p /tmp/hello && echo '<h1>Hi</h1>' > /tmp/hello/index.html
(cd /tmp/hello && zip -r ../hello.zip .)

# run Orbit
pnpm orbit:dev

# in another terminal — use the dev helper from the next task
pnpm --filter @nublestation/orbit exec tsx scripts/sign-and-curl.ts tasks /tmp/hello.zip

# expected:
ls ~/.nuble-dev/apps/tasks/current/
# → index.html
```

## Tests

`apps/orbit/test/upload.test.ts`:

- happy path: valid HMAC + valid zip → 200, file lands in `current/`
- tampered sig → 401 (no files written)
- tampered body (sig was computed before body change) → 401
- stale timestamp → 401
- oversized Content-Length → 413 (before reading body)
- non-zip body → 422
- zip-slip in entries → 400
- zip without `index.html` → 400

Test setup: tmpdir as `NUBLE_APPS_DIR`, build small zips with `yazl`, call `app.request(url, init)` directly (Hono in-process).

## Acceptance

`pnpm orbit:test` passes all of the above. Manual end-to-end on Mac with the dev helper succeeds. After two deploys, `~/.nuble-dev/apps/tasks/.previous/index.html` matches the first deploy and `current/index.html` matches the second.

## Out of scope

- Recording deployment in `platform.deployments` (M8 — Blaze admin route exists)
- Rollback endpoint → [[orbit-rollback]]

## References

- `docs/adr/007-deployment-service.md` §4 (deploy algorithm), §9 (streaming)
- `apps/orbit/src/deploy/extract.ts` from [[orbit-zip-streaming-extraction]]
- `apps/orbit/src/deploy/swap.ts` from [[orbit-atomic-swap]]
- `apps/orbit/src/middleware/hmac.ts` from [[orbit-hmac-middleware]]
- busboy docs: https://github.com/mscdex/busboy
