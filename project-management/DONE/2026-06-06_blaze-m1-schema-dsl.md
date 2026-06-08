# 2026-06-06 — Blaze M1: `@nublestation/blaze` schema DSL package

## What was done

Implemented Milestone 1 of the Blaze implementation plan (`docs/plans/01-blaze-implementation.md`): the `@nublestation/blaze` schema DSL package (`packages/blaze/`), committed on `feature/blaze` as `ad86173`.

## Files created / changed

| File | Change |
|---|---|
| `packages/blaze/package.json` | New package `@nublestation/blaze@0.1.0`, subpath exports `.` and `./validate`, dep `zod ^3.23.8` |
| `packages/blaze/src/types.ts` | `SerializedSchema/Table/Field/Index` wire types, `FieldType`, `OnDelete`, `SerializedDefault` |
| `packages/blaze/src/builders.ts` | `t` namespace — all field builders + `t.model()`, `FieldBuilder`, `ModelBuilder`, `InferRow`/`InferInsert` phantom types |
| `packages/blaze/src/define-schema.ts` | `defineSchema()`, bare-map normalization, full validation, `InferSchema<S>` |
| `packages/blaze/src/reserved.ts` | `RESERVED_TABLE_NAMES`, `RESERVED_COLUMN_NAMES`, `assertValidIdentifier`, SQL keyword list |
| `packages/blaze/src/serialize.ts` | `serializeSchema()`, `canonicalJson()`, `canonicalChecksum()` (Web Crypto sha256) |
| `packages/blaze/src/errors.ts` | `SchemaError extends Error` |
| `packages/blaze/src/index.ts` | Re-exports for `.` subpath |
| `packages/blaze/src/validate.ts` | `toZodSchema(table, "insert"\|"update")` for `./validate` subpath |
| `packages/blaze/test/*.test.ts` | 4 test suites, 19 tests |
| `packages/blaze/tsconfig.json` | `noEmit: true`, src + test |
| `packages/blaze/tsconfig.build.json` | `noEmit: false`, src only, emits declarations |
| `packages/blaze/vitest.config.ts` | `pool: forks`, `testTimeout: 10_000` |
| `docs/adr/015-*.md` | §1 updated: renamed `@nublestation/schema` → `@nublestation/blaze`, documented model-wrapper DSL shape and all three subpaths |
| `docs/documentation/blaze-schema-dsl.md` | New overview doc covering DSL API, subpaths, type inference, wire format, validation, pipeline diagram |
| `pnpm-lock.yaml` | Updated for new `zod` dependency in `packages/blaze` |

## Gate results (all green before commit)

- `pnpm --filter @nublestation/blaze test` — 19/19 tests pass
- `pnpm --filter @nublestation/blaze check-types` — clean
- `pnpm --filter @nublestation/blaze build` — emits `dist/` for `.` and `./validate`
- Runtime smoke: both subpaths import and execute correctly

## Key decisions recorded

- **Package name**: `@nublestation/blaze` (bare name = client pkg convention; `@nublestation/schema` from ADR 015 draft was stale)
- **DSL shape**: model-wrapper `t.model({…}).index(col)` — reserves per-model config slot for future extensions with no breaking change; bare field maps also accepted
- **Browser safety**: `.` entry has zero runtime deps; `zod` only reachable via `./validate`
- **Checksum**: Web Crypto `crypto.subtle` sha256 — works in Node 20+ and browser without `node:crypto`
- **`./compile`**: declared in M2 (drizzle-orm); not in this commit

## Next step

M2: DSL→Drizzle→SQL compiler via `drizzle-kit/api` — separate plan + confirmation required before starting.
