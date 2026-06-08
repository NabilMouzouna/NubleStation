---
title: "@nublestation/blaze"
description: Schema-as-code plus a typed auto-REST client for your app's tables.
---

`@nublestation/blaze` is two things in one package:

1. A **schema DSL** (`defineSchema`, `t`) you use to declare your tables in TypeScript.
2. A **typed table client** (`createBlazeClient`) that gives every table `list` / `get` /
   `create` / `update` / `delete` methods, fully typed from your schema.

You can also reach the same table client through the unified
[`@nublestation/client`](/NubleStation/docs/sdk/client) as `nuble.blaze`.

## Installation

```bash
npm install @nublestation/blaze
# or
pnpm add @nublestation/blaze
```

## 1. Declare your schema

```typescript
// schema.ts
import { defineSchema, t } from "@nublestation/blaze";

export const schema = defineSchema({
  file_comments: t.model({
    file_id:     t.string().required(),
    body:        t.string().required(),
    author_id:   t.string().required(),
    author_name: t.string().required(),
  }),
});
```

Field builders: `t.string()`, `t.number()`, `t.boolean()`, `t.uuid()`, `t.timestamp()`,
`t.json()`, `t.enum([...])`, `t.ref("table")`. Modifiers: `.required()`, `.unique()`,
`.default(value)`, `.index()`. Every table automatically gets an `id` (uuid, primary key)
and an `app_id` (uuid) column — you never declare those.

Push the schema with the CLI — see [`nuble db push`](/NubleStation/docs/cli/commands).

## 2. Create a client

```typescript
import { createBlazeClient } from "@nublestation/blaze";
import { schema } from "./schema";

const blaze = createBlazeClient({
  baseUrl: "http://api.clinic.local",
  apiKey:  "nbl_<key_id>.<secret>",
  schema,
}).db;
```

`schema` is optional, but passing it makes table names and row shapes type-safe.

## 3. CRUD

Every table exposes five methods. They map 1:1 to the auto-generated REST endpoints
([Blaze service](/NubleStation/docs/services/database)).

### list

```typescript
const comments = await blaze.file_comments.list();
const page2    = await blaze.file_comments.list({ limit: 20, offset: 20 });
```

`list(opts?)` returns every row for your app (subject to RLS), with optional `limit` and
`offset` for pagination.

### get

```typescript
const comment = await blaze.file_comments.get(commentId);
// returns the row, or throws if not found
```

### create

```typescript
const comment = await blaze.file_comments.create({
  file_id:     fileId,
  body:        "Looks good to me",
  author_id:   user.id,
  author_name: user.name,
});
// returns the created row, with server-generated id
```

### update

```typescript
const updated = await blaze.file_comments.update(commentId, {
  body: "Edited comment",
});
```

`update` accepts a partial — unknown fields are dropped silently by the server.

### delete

```typescript
await blaze.file_comments.delete(commentId);
```

## Current limitations

<Aside type="caution">
  The shipped auto-REST surface is intentionally minimal. `list()` has **no server-side
  WHERE/filter, sort, or join support yet** — it returns all of your app's rows. Filter,
  sort, and paginate **client-side** for now:

  ```typescript
  const all = await blaze.file_comments.list();
  const forFile = all.filter((c) => c.file_id === fileId);
  ```

  Richer querying (filters, relations, aggregations) is on the
  [roadmap](/NubleStation/docs/reference/roadmap).
</Aside>

## Isolation

Every query runs inside a tenant-scoped transaction. Postgres Row-Level Security adds
`app_id = current_setting('app.current_tenant')` to every statement, so one app can never
read or write another app's rows — even though they share one physical table. See
[Row-Level Security](/NubleStation/docs/security/row-level-security).

## Exports

```typescript
import { defineSchema, t, serializeSchema, createBlazeClient } from "@nublestation/blaze";
import type { Schema, SerializedSchema, BlazeClient } from "@nublestation/blaze";
```
