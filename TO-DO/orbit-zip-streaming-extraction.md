# Orbit — Zip streaming extraction (M5.3)

> Stream a zip's bytes into the target directory without buffering the archive in memory. Includes zip-slip protection, type/path validation, and an `index.html` presence check.

## Goal

`extractZipStream(zipStream, targetDir)` reads a zip from a Node `Readable`, writes each entry to disk under `targetDir`, and returns extraction metadata. Peak RAM stays bounded regardless of zip size.

## Files to create

```
apps/orbit/src/deploy/
├── extract.ts        extractZipStream(stream, targetDir): Promise<ExtractResult>
└── paths.ts          appDir, currentDir, incomingDir, previousDir helpers
```

## Dependency

```
yauzl ^3        (streaming zip parser, no native deps)
@types/yauzl ^2 (devDep)
```

## API

```ts
// apps/orbit/src/deploy/extract.ts

export interface ExtractResult {
  files: number       // number of file entries written
  totalBytes: number  // sum of uncompressed sizes
  hasIndexHtml: boolean
}

export async function extractZipStream(
  source: Readable,
  targetDir: string,
  opts?: { maxBytes?: number },
): Promise<ExtractResult>
```

Throws domain errors that the route layer maps to HTTP status:

- `ZipSlipError` → 400 `zip_slip`
- `MissingIndexHtmlError` → 400 `missing_index_html`
- `OverSizeError` → 413 `too_large`
- `InvalidZipError` → 422 `invalid_zip`

## Algorithm

`yauzl` reads from a buffer-by-default, but `yauzl.fromBuffer` requires the whole zip in memory. **Use the disk-spool pattern instead:**

1. Caller (`upload.ts`) pipes `source` into a temp file (`/tmp/orbit-upload-{uuid}.zip`) on disk **as it arrives**. This uses bounded RAM (Node stream backpressure handles it).
2. Once the upload finishes, `yauzl.open(tempPath)` lazily reads the central directory.
3. For each entry: `zip.openReadStream(entry)` returns a Readable; pipe it to `fs.createWriteStream(targetPath)`.
4. Delete the temp file when done (success or failure).

This is the standard yauzl streaming pattern. Peak RAM stays at yauzl's internal buffer (~16 KB) plus one per-write buffer.

### Zip slip protection

For each entry, compute the resolved write path and verify it stays inside `targetDir`:

```ts
const resolved = path.resolve(targetDir, entry.fileName)
const targetWithSep = targetDir.endsWith(path.sep) ? targetDir : targetDir + path.sep
if (resolved !== targetDir && !resolved.startsWith(targetWithSep)) {
  throw new ZipSlipError(entry.fileName)
}
```

Reject explicitly:

- entries whose name contains `..` segments (before resolving)
- entries with absolute paths (starts with `/` or drive letter on Windows-style paths)
- entries with external attributes indicating a symlink (`(entry.externalFileAttributes >>> 16) & 0o170000 === 0o120000`)

### `index.html` validation

After iterating all entries, error if none of the **root-level** file entries was named `index.html`. Root level means `entry.fileName` is exactly `index.html` (no `/` before it).

### Size limit

The `maxBytes` option (caller passes `MAX_UPLOAD_SIZE_MB * 1024 * 1024`) is checked against the **sum of uncompressed entry sizes**. If any entry's `uncompressedSize` is `0xFFFFFFFF` (zip64 sentinel), treat as unknown and reject — we don't support unbounded zips in v1.

## paths.ts

```ts
export function appDir(appsRoot: string, slug: string) {
  return path.join(appsRoot, slug)
}
export function currentDir(appsRoot: string, slug: string) {
  return path.join(appDir(appsRoot, slug), 'current')
}
export function incomingDir(appsRoot: string, slug: string, ts: number) {
  return path.join(appDir(appsRoot, slug), `.incoming-${ts}`)
}
export function previousDir(appsRoot: string, slug: string) {
  return path.join(appDir(appsRoot, slug), '.previous')
}
```

## Tests

`apps/orbit/test/extract.test.ts` — use `yazl` (in devDeps) to build test zips in-memory:

- valid zip with `index.html` extracts every file; result counts/bytes match
- entry with `../etc/passwd` → throws `ZipSlipError`
- entry with absolute path → throws `ZipSlipError`
- entry that is a symlink → throws `ZipSlipError`
- zip without `index.html` at root → throws `MissingIndexHtmlError`
- zip exceeding `maxBytes` → throws `OverSizeError`
- non-zip bytes → throws `InvalidZipError`

Each test uses a tmpdir target and cleans up after. Use `node:os.tmpdir()` + `node:fs.mkdtemp()`.

## Acceptance

`pnpm orbit:test` passes. All tests use real disk (tmpdir), not mocked filesystem. Peak RSS during the largest test stays under 50 MB (sanity check; not asserted in CI, but eyeball with `node --inspect`).

## Out of scope

- Atomic swap (current/incoming/previous) → [[orbit-atomic-swap]]
- Multipart parsing → [[orbit-upload-route]]

## References

- `docs/adr/007-deployment-service.md` §9 — streaming rationale
- yauzl streaming pattern: https://github.com/thejoshwolfe/yauzl#streaming
- zip slip background: https://snyk.io/research/zip-slip-vulnerability
