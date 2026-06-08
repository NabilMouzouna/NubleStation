# Recap — nubleClient unified SDK

**Date:** 2026-06-08  
**Branch:** feature/blaze  
**Commit:** aa6e2ed

## What was done

Rewrote `@nublestation/client` to expose all three NubleStation services through a single `nubleClient()` function.

### New API
```ts
import { nubleClient } from "@nublestation/client";
import { schema } from "./schema";

const nuble = nubleClient("nbl_key", "http://api.clinic.local", { app: "bucket", schema });
const { vault, identity, blaze } = nuble;

await vault.listMine();
await blaze.file_comments.list();
const session = await identity.getSession();
```

### Files changed
- `packages/client/src/client.ts` — replaced `createClient` with `nubleClient(apiKey, url, opts?)`; kept `createClient` as a deprecated alias
- `packages/client/src/index.ts` — exports `nubleClient`, schema DSL re-exports (`defineSchema`, `t`, `serializeSchema`), common service types
- `packages/client/package.json` — added `@nublestation/identity` and `@nublestation/blaze` as workspace dependencies
- `packages/blaze/src/client.ts` — made `schema` optional in `BlazeConfig`; added Symbol guard to Proxy `get` trap to prevent "Cannot convert a Symbol value to a string" crash

### Symbol guard fix
Vitest's `expect()` introspects objects with Symbol keys. The blaze `db` Proxy was coercing Symbol props to string. Fixed with:
```ts
get(_, prop) {
  if (typeof prop !== "string") return undefined;
  return makeTableClient(baseUrl, headers, prop);
}
```

## Test result
All 8 tests in `packages/client` pass.
