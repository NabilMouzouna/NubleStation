---
title: Quick Start
description: From a fresh install to your first app running on the LAN in five minutes.
---

import { Aside, Steps } from '@astrojs/starlight/components';

This guide assumes NubleStation is already [installed and running](/getting-started/installation/). You'll create an app, issue an API key, and query the database from a minimal TypeScript project.

## 1. Create an app in the Console

<Steps>
1. Open `http://console.{org}.local` and sign in as admin.
2. Go to **Apps → New App**.
3. Enter a name, e.g. `tasks`. NubleStation reserves `tasks.{org}.local` and generates an API key.
4. Copy the API key — it looks like `nbl_abc123.supersecret`. You won't see the secret again.
</Steps>

## 2. Initialize a local project

```bash
mkdir my-clinic-app && cd my-clinic-app
npm init -y
npm install @nublestation/sdk typescript tsx
```

Create `schema.ts`:

```typescript
import { defineSchema, t } from '@nublestation/sdk/schema';

export default defineSchema({
  tasks: {
    title: t.string().required(),
    status: t.enum(['pending', 'in_progress', 'done']).default('pending'),
    priority: t.enum(['low', 'medium', 'high']).default('medium'),
    assignee: t.ref('users'),
    createdAt: t.timestamp().default('now'),
  },
});
```

## 3. Push the schema

```bash
npx nuble db push --app tasks
```

NubleStation generates the migration SQL, injects `app_id` and the RLS policy automatically, and runs it against Postgres. You'll see:

```
✔ Migration 001_create_tasks.sql applied
✔ Types written to .nuble/types.ts
```

## 4. Query the database

Create `index.ts`:

```typescript
import { createClient } from '@nublestation/sdk';

const nuble = createClient({
  url: 'http://api.clinic.local',
  apiKey: process.env.NUBLE_API_KEY!,
});

// Create a task
const task = await nuble.db.tasks.create({
  title: 'Review patient chart — John Doe',
  priority: 'high',
});

console.log('Created:', task.id);

// List pending tasks
const pending = await nuble.db.tasks.findMany({
  where: { status: 'pending' },
  orderBy: { createdAt: 'desc' },
  limit: 10,
});

console.log('Pending tasks:', pending.length);
```

Run it:

```bash
NUBLE_API_KEY=nbl_abc123.supersecret npx tsx index.ts
```

## 5. Deploy a frontend

Build your SPA (any framework — Vite, Next.js static export, etc.):

```bash
npm run build        # produces dist/
npx nuble deploy --app tasks
```

The CLI uploads the `dist/` folder. Caddy immediately starts serving it at `http://tasks.{org}.local`. No restart required.

## What just happened

```
Your machine
  └── nuble db push   → migration SQL → API Gateway → DB Service → Postgres
  └── nuble deploy    → dist.zip       → API Gateway → Deploy Service → /var/nuble/tasks/

Any device on the LAN
  └── DNS: tasks.clinic.local → 192.168.1.100 (CoreDNS)
  └── HTTP: 192.168.1.100:80 → Caddy → /var/nuble/tasks/ (static files)
  └── API: api.clinic.local/db/tasks → Caddy → Gateway → DB Service → Postgres (RLS scoped)
```

<Aside type="tip">
  **Offline demo:** unplug the internet cable. Everything still works. CoreDNS, Caddy, and Postgres are all running locally. NubleStation has zero internet dependencies at runtime.
</Aside>

## Next steps

- [Understand the Architecture](/concepts/architecture/) — how the containers relate
- [Database Service docs](/services/database/) — filters, relations, escape hatches
- [SDK reference](/sdk/overview/) — full builder API
