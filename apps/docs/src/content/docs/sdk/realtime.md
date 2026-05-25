---
title: Real-time Subscriptions
description: Live data updates via Server-Sent Events backed by Postgres LISTEN/NOTIFY.
---

import { Aside } from '@astrojs/starlight/components';

<Aside type="caution">
  Real-time subscriptions are planned for Phase 5. This page documents the intended API.
</Aside>

## How it works

NubleStation real-time uses **Server-Sent Events (SSE)** — a one-way HTTP push mechanism built into every browser. No WebSocket upgrade, no special protocol. The SDK opens a long-lived HTTP connection and the server pushes events as JSON lines.

On the server side, the DB service uses Postgres `LISTEN/NOTIFY`. When any row in a `tenant_data` table is inserted, updated, or deleted, an auto-generated trigger fires `NOTIFY` with a JSON payload. The DB service receives the notification, filters it by tenant and subscription filter, and pushes it to the connected client.

```
Browser
  └── SSE connection to api.clinic.local/v1/db/subscribe?table=tasks&status=eq.pending

DB Service
  └── LISTEN tenant_data_changes

Postgres
  └── INSERT into tenant_data.tasks →
        trigger fires →
        NOTIFY tenant_data_changes '{"op":"insert","app_id":"...","row":{...}}'

DB Service
  └── receives notification
  └── app_id matches? yes
  └── filter matches? (status=pending) yes
  └── push SSE event to browser

Browser receives:
  data: {"type":"insert","row":{"id":"...","title":"...","status":"pending"}}
```

## SDK usage

### Subscribe to a table

```typescript
const unsubscribe = nuble.db.tasks.subscribe(
  { where: { status: 'pending' } },
  (event) => {
    console.log(event.type, event.row);
    // 'insert', { id: '...', title: '...', status: 'pending' }
  }
);

// Later, when done:
unsubscribe();
```

### Event types

| Type | When fired |
|---|---|
| `insert` | A new row matching the filter was inserted |
| `update` | A row matching the filter was updated |
| `delete` | A row that matched the filter was deleted |

### React example

```typescript
import { useEffect, useState } from 'react';
import { nuble } from './client';

function PendingTasks() {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    // Initial load
    nuble.db.tasks.findMany({ where: { status: 'pending' } })
      .then(setTasks);

    // Live updates
    const unsub = nuble.db.tasks.subscribe(
      { where: { status: 'pending' } },
      (event) => {
        if (event.type === 'insert') {
          setTasks(prev => [event.row, ...prev]);
        } else if (event.type === 'delete') {
          setTasks(prev => prev.filter(t => t.id !== event.row.id));
        } else if (event.type === 'update') {
          setTasks(prev => prev.map(t => t.id === event.row.id ? event.row : t));
        }
      }
    );

    return unsub;
  }, []);

  return <ul>{tasks.map(t => <li key={t.id}>{t.title}</li>)}</ul>;
}
```

## Isolation guarantee

Subscriptions are tenant-scoped. A notification from app B's `tasks` table is never sent to a client authenticated with app A's API key — the DB service filters by `app_id` before pushing.

## Why SSE instead of WebSockets

| | SSE | WebSockets |
|---|---|---|
| Direction | Server → Client (one-way) | Bidirectional |
| Protocol | Plain HTTP | Protocol upgrade |
| Auto-reconnect | Built into the browser | Must implement manually |
| LAN compatibility | Works everywhere | Usually works (some proxy issues) |
| Server complexity | ~150 lines | Significantly more |
| Use case fit | Data updates, notifications | Chat, collaborative editing |

95% of clinic use cases need **server-push only** — a new task was assigned, a record was updated, a notification arrived. SSE covers all of these. WebSockets are planned as a v2 option for use cases that require it.
