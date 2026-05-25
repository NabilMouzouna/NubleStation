---
title: SDK Overview
description: The @nublestation/sdk package — how to install it, configure it, and what it covers.
---

import { Aside } from '@astrojs/starlight/components';

## What the SDK is

`@nublestation/sdk` is the TypeScript client library app developers use to interact with NubleStation. It handles:

- Authentication (API key in every request)
- Building REST queries from a fluent builder API
- Type safety derived from your `schema.ts`
- Real-time subscriptions via Server-Sent Events

The SDK never speaks SQL and never holds a database connection. It builds HTTP requests and sends them to `api.{org}.local` — the gateway handles everything else.

## Installation

```bash
npm install @nublestation/sdk
# or
pnpm add @nublestation/sdk
```

<Aside type="note">
  The SDK is currently in development alongside the platform. The API shown here reflects the planned v1 surface. Import paths and method signatures may change before the stable release.
</Aside>

## Creating a client

```typescript
import { createClient } from '@nublestation/sdk';

const nuble = createClient({
  url: 'http://api.clinic.local',    // your NubleStation gateway URL
  apiKey: process.env.NUBLE_API_KEY, // nbl_<key_id>.<secret>
});
```

All methods on `nuble` are authenticated with this API key automatically.

## Client structure

```
nuble
├── nuble.db.*           database queries on your custom + built-in tables
├── nuble.users.*        built-in user management
├── nuble.files.*        built-in file storage
├── nuble.notifications.*  built-in notification queue
└── nuble.realtime.*     SSE subscriptions (Phase 5)
```

## Type safety

After running `nuble db push --app tasks`, the CLI writes `.nuble/types.ts`:

```typescript
// .nuble/types.ts — auto-generated, do not edit
export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  assigneeId: string | null;
  createdAt: string;
}
```

The SDK's TypeScript generics pick these up:

```typescript
// Fully typed — status autocompletes to 'pending' | 'in_progress' | 'done'
const tasks = await nuble.db.tasks.findMany({
  where: { status: 'pending' },
});
// tasks: Task[]
```

## Error handling

All SDK methods throw structured errors:

```typescript
import { NubleError } from '@nublestation/sdk';

try {
  await nuble.db.tasks.create({ title: '' });
} catch (err) {
  if (err instanceof NubleError) {
    console.error(err.code, err.message);
    // 'validation_error', 'title is required'
  }
}
```

Common error codes:

| Code | Meaning |
|---|---|
| `unauthorized` | API key missing, expired, or invalid |
| `forbidden` | User lacks access to this app |
| `not_found` | Row or resource doesn't exist |
| `validation_error` | Request body failed schema validation |
| `quota_exceeded` | Request exceeds row limit or body size |
| `rate_limited` | Too many requests (429) |

## Next

- [Database Queries](/sdk/database/) — filters, relations, pagination, aggregations
- [Real-time Subscriptions](/sdk/realtime/) — SSE-based live updates
