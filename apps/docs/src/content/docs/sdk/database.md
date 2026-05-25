---
title: Database Queries
description: Full reference for nuble.db.* — CRUD, filters, relations, aggregations, and escape hatches.
---

## CRUD

### findMany

```typescript
const tasks = await nuble.db.tasks.findMany({
  where: { status: 'pending' },
  orderBy: { createdAt: 'desc' },
  limit: 20,
  offset: 0,
  select: ['id', 'title', 'status', 'priority'],
});
```

### findOne

```typescript
const task = await nuble.db.tasks.findOne({
  where: { id: taskId },
});
// returns Task | null
```

### create

```typescript
const task = await nuble.db.tasks.create({
  title: 'Review chart — John Doe',
  priority: 'high',
  status: 'pending',
});
// returns Task (with server-generated id and createdAt)
```

### update

```typescript
const updated = await nuble.db.tasks.update(taskId, {
  status: 'in_progress',
});
```

### delete

```typescript
await nuble.db.tasks.delete(taskId);
```

## Filter operators

| Operator | Meaning | Example |
|---|---|---|
| `eq` | equals | `{ status: { eq: 'pending' } }` or shorthand `{ status: 'pending' }` |
| `neq` | not equals | `{ status: { neq: 'done' } }` |
| `in` | in array | `{ priority: { in: ['high', 'medium'] } }` |
| `nin` | not in array | `{ priority: { nin: ['low'] } }` |
| `gt` | greater than | `{ createdAt: { gt: '2026-01-01' } }` |
| `gte` | greater or equal | `{ createdAt: { gte: '2026-01-01' } }` |
| `lt` | less than | `{ createdAt: { lt: '2026-12-31' } }` |
| `lte` | less or equal | `{ createdAt: { lte: '2026-12-31' } }` |
| `like` | SQL LIKE | `{ title: { like: '%urgent%' } }` |
| `ilike` | case-insensitive LIKE | `{ title: { ilike: '%urgent%' } }` |
| `is` | IS NULL / IS NOT NULL | `{ assigneeId: { is: null } }` |
| `contains` | JSONB contains (`@>`) | `{ metadata: { contains: { tag: 'vip' } } }` |
| `hasKey` | JSONB key exists | `{ metadata: { hasKey: 'assignee' } }` |

## Relations

Use `include` to fetch related rows in a single request:

```typescript
const task = await nuble.db.tasks.findOne({
  where: { id: taskId },
  include: {
    assignee: true,               // t.ref('users') → joins users view
    comments: {
      include: { author: true },  // nested include
      orderBy: { createdAt: 'asc' },
    },
  },
});
```

This compiles to a single SQL query with JOINs — not N+1 requests.

## Aggregations

```typescript
const stats = await nuble.db.tasks.aggregate({
  count: true,
  where: { status: 'done' },
});
// { count: 42 }

const grouped = await nuble.db.tasks.aggregate({
  groupBy: 'status',
  count: true,
});
// [{ status: 'pending', count: 10 }, { status: 'done', count: 32 }, ...]
```

## Pagination

```typescript
// Offset-based
const page1 = await nuble.db.tasks.findMany({ limit: 20, offset: 0 });
const page2 = await nuble.db.tasks.findMany({ limit: 20, offset: 20 });
```

The SDK returns metadata alongside results:

```typescript
const { data, count, hasMore } = await nuble.db.tasks.findMany({
  limit: 20,
  paginate: true,
});
```

## Selecting specific columns

```typescript
const titles = await nuble.db.tasks.findMany({
  select: ['id', 'title'],
  where: { status: 'pending' },
});
// [{ id: '...', title: '...' }, ...]
```

## Named queries (Level 2 escape)

For complex SQL the builder can't express:

```typescript
const top = await nuble.db.query('topAssignees', { limit: 5 });
// [{ userId: '...', taskCount: 12 }, ...]
```

Named queries are defined in `schema.ts` with `defineQuery()`, validated at push time, and logged to `audit_log` on every execution.

## Built-in users

```typescript
// Find a user by email
const user = await nuble.users.findBy({ email: 'dr.smith@clinic.local' });

// Create a user (grants access to the calling app automatically)
const newUser = await nuble.users.create({
  email: 'nurse.jones@clinic.local',
  password: 'secure-password',
  role: 'nurse',
});

// List users with access to the calling app
const users = await nuble.users.list();
```

## Limits enforced by the server

| Limit | Default |
|---|---|
| Max rows per request | 1000 |
| Max request body size | 100 KB |
| Max query execution time | 30 s |

Exceeding these returns a structured error with code `quota_exceeded` or `timeout`.
