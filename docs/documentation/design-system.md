# NubleStation Design System

The NubleStation design system is the single source of truth for visual and interaction decisions in the Console (`apps/console`) and any future customer-facing surface. It is grounded in the actual brand assets in `packages/assets/` and implemented as design tokens in `packages/ui/src/styles/tokens.css`.

All components are sourced from **shadcn/ui (New York style)** and customized with NubleStation tokens. Icons are **Lucide**.

---

## Brand Assets

| Asset | File | Format | Usage |
|---|---|---|---|
| Full logo — light bg | `packages/assets/logo-light.svg` | SVG (preferred) / PNG | Auth page, marketing, onboarding |
| Icon only | `packages/assets/icon.svg` | SVG (preferred) / PNG | Sidebar header (collapsed), favicon, app icon |
| Terminal logo | `packages/assets/logo-ansi.sh` | POSIX sh | `install.sh` TUI — ANSI terminal only |

### Logo anatomy

```
[  cloud icon  ]  NubleStation
                  PRIVATE · LOCAL · YOURS
```

- **Cloud**: indigo-to-violet gradient body (`#1F4FE0` → `#9B5BFF`), two vertical legs, horizontal bar — all same gradient
- **"Nuble"**: near-black `#091216`, weight medium-bold
- **"Station"**: slate `#5C6B7A`, weight regular
- **Tagline**: slate `#5C6B7A`, spaced uppercase, small

### Logo usage rules

- Always use the SVG — never stretch or recolor the logo
- Minimum clear space: equal to the cloud icon height on all sides
- Sidebar expanded → `logo-light.svg` at full width
- Sidebar collapsed / narrow space → `icon.svg` only
- Dark backgrounds → dark variant needed (not yet produced, deferred to v1.0)

---

## Color Palette

All tokens are CSS custom properties defined in `packages/ui/src/styles/tokens.css` under `@theme {}`.

### Brand colors

Extracted directly from `packages/assets/icon.svg` and `packages/assets/logo-light.svg`.

| Token | Value | Source |
|---|---|---|
| `--color-brand-blue` | `#1F4FE0` | Icon gradient start |
| `--color-brand-purple` | `#5F55F0` | Cloud body in full logo |
| `--color-brand-violet` | `#9B5BFF` | Icon gradient end, network bar |

The brand gradient: `linear-gradient(135deg, #1F4FE0, #9B5BFF)`

### Semantic tokens

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#5F55F0` | Primary CTA buttons, active nav item, focus rings |
| `--color-primary-deep` | `#4340D4` | Primary button hover state |
| `--color-primary-foreground` | `#ffffff` | Text on primary background |

### Surface tokens

| Token | Value | Usage |
|---|---|---|
| `--color-background` | `#ffffff` | Page background |
| `--color-foreground` | `#091216` | Default text (matches "Nuble" wordmark) |
| `--color-card` | `#ffffff` | Card background |
| `--color-card-foreground` | `#1c1e21` | Card body text |
| `--color-muted` | `#f1f4f7` | Subtle backgrounds, empty states |
| `--color-muted-foreground` | `#5d6c7b` | Placeholder text, secondary labels |

### Line and input tokens

| Token | Value | Usage |
|---|---|---|
| `--color-border` | `#dee3e9` | Card borders, dividers, table rules |
| `--color-input` | `#ced0d4` | Input border |
| `--color-ring` | `#5F55F0` | Focus ring (matches primary) |

### Semantic status tokens

| Token | Value | Usage |
|---|---|---|
| `--color-success` | `#31a24c` | Running services, successful deploys |
| `--color-attention` | `#f2a918` | Warnings, degraded state |
| `--color-warning` | `#f7b928` | Non-critical alerts |
| `--color-destructive` | `#e41e3f` | Errors, down services, delete actions |
| `--color-destructive-foreground` | `#ffffff` | Text on destructive background |

---

## Typography

Font family: **Inter** (open variable font, closest open equivalent to Meta's Optimistic VF).

```css
font-family: 'Inter', system-ui, -apple-system, sans-serif;
```

Use `font-feature-settings: 'ss01', 'ss02'` on display headings to enable stylistic alternates.

### Scale

| Role | Size | Weight | Tracking | Usage |
|---|---|---|---|---|
| Display | 36px / 2.25rem | 600 | -0.02em | Page heroes, empty state headlines |
| H1 | 30px / 1.875rem | 600 | -0.01em | Page titles |
| H2 | 24px / 1.5rem | 500 | -0.01em | Section headings, card titles |
| H3 | 20px / 1.25rem | 500 | 0 | Sub-section headings |
| H4 | 16px / 1rem | 600 | 0 | Table headers, form section labels |
| Body | 14px / 0.875rem | 400 | 0 | Default body text |
| Small | 12px / 0.75rem | 400 | 0 | Captions, metadata, timestamps |
| Label | 12px / 0.75rem | 500 | 0.05em | Uppercase labels, tagline |
| Mono | 13px / 0.8125rem | 400 | 0 | Code, API keys, terminal output |

---

## Spacing

Base unit: **4px**. All spacing values are multiples.

| Token | Value | Common usage |
|---|---|---|
| `space-1` | 4px | Icon gap, tight inline spacing |
| `space-2` | 8px | Input padding top/bottom, badge padding |
| `space-3` | 12px | Inline button padding (sm) |
| `space-4` | 16px | Card internal gap, form field gap |
| `space-5` | 20px | Section gap |
| `space-6` | 24px | Card padding (md) |
| `space-8` | 32px | Card padding (lg), page section gap |
| `space-12` | 48px | Page top padding |
| `space-16` | 64px | Empty state vertical spacing |

---

## Border Radius

The **32px card + pill button** pairing is the primary visual signature of NubleStation.

| Token | Value | Usage |
|---|---|---|
| `--radius-xs` | 2px | Micro badges, dots |
| `--radius-sm` | 4px | Code blocks, kbd |
| `--radius-md` | 6px | Small chips, tags |
| `--radius-lg` | 8px | Dropdowns, tooltips, toasts |
| `--radius-xl` | 16px | Modals, drawers |
| `--radius-2xl` | 24px | Large panels |
| `--radius-3xl` | 32px | **Cards** — the signature radius |
| `--radius-full` | 9999px | **Buttons**, avatars, progress bars |

---

## Components

All components are added via shadcn/ui CLI pointed at `packages/ui`. Style: New York. Icon library: Lucide.

```bash
pnpm dlx shadcn@latest add <component> --cwd packages/ui
```

### Alert Dialog

Destructive confirmations: delete app, revoke API key, reset admin password, wipe install.

- Trigger: a `destructive` variant Button
- Confirm button: `destructive` variant
- Cancel button: `ghost` variant
- Title: concise verb phrase ("Delete app?")
- Description: one sentence on consequences, never reversible actions framed as questions

### Avatar

Used in the admin list (`/admins`), audit log (`/audit`), and the sidebar footer (current admin identity).

- Fallback: initials from `email` (first two characters, uppercased)
- Size: `size-8` (32px) in tables, `size-10` (40px) in sidebar

### Badge

Inline labels for status, roles, and resource types.

| Variant | Color | Usage |
|---|---|---|
| `default` | Primary purple | Active, running, live |
| `secondary` | Muted | Draft, inactive |
| `destructive` | Red | Down, error, revoked |
| `outline` | Border | Role labels (super_admin, admin) |

Status badges used on the dashboard grid: map `running` → `default`, `degraded` → `attention` (custom), `down` → `destructive`.

### Breadcrumb

Used on `/apps/:app` and any nested detail page.

```
Apps  /  tasks  /  Deployments
```

- Separator: `/` (Lucide `ChevronRight`)
- Last segment: not a link, muted foreground color
- Never more than 3 levels deep in Console

### Button

Five variants, four sizes. All buttons use `rounded-full` (pill geometry — the ADR signature).

| Variant | Background | Usage |
|---|---|---|
| `default` | Primary purple | Primary CTA ("Create app", "Deploy", "Save") |
| `ink` | Near-black foreground | Secondary CTA where two equal actions appear |
| `secondary` | Outlined foreground | Cancel, secondary actions |
| `ghost` | Transparent bordered | Tertiary, icon-only toolbar actions |
| `destructive` | Red | Delete, revoke, irreversible actions |

| Size | Height | Usage |
|---|---|---|
| `sm` | 36px | Inline table actions, compact toolbars |
| `default` | 44px | Standard form submit |
| `lg` | 48px | Auth page "Sign in", empty state CTA |
| `icon` | 40px × 40px | Icon-only buttons (copy, refresh, filter) |

### Card

The primary layout container. Uses `rounded-3xl` (32px) — the visual signature.

```tsx
<Card>
  <CardHeader>
    <CardTitle>App name</CardTitle>
    <CardDescription>Subdomain and created date</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>...</CardFooter>
</Card>
```

Padding: `p-8` (32px) on header, content, and footer. Use cards for: dashboard service tiles, app list items, stat summaries, form panels.

### Chart

Used on `/dashboard` for service uptime sparklines and on `/storage` for disk usage breakdown.

Chart types in use:

| Chart | Route | Data |
|---|---|---|
| Area (sparkline) | `/dashboard` | Uptime over 24h per service |
| Bar | `/storage` | Per-app storage breakdown |
| Radial | `/dashboard` | Quick metrics (apps, users, storage %) |

Colors: use brand tokens — `--color-primary` for primary series, `--color-muted-foreground` for secondary, `--color-destructive` for error series.

### Data Table

Used on: `/audit`, `/apps/:app` deployments, migrations, API keys, users tabs.

- Columns: defined per route, always include a timestamp column sorted descending
- Pagination: 25 rows default, 50/100 options
- No client-side sort on large tables — sort is a query param
- Empty state: use the `Empty` component (see below)
- Row actions: `DropdownMenu` in the last column

### Drawer

Mobile-first side panel. Used for:

- Creating a new app (slides in from the right on mobile, modal on desktop)
- File preview in `/storage` (slides up from bottom on mobile)

Prefer `Dialog` over `Drawer` for desktop-first flows.

### Dropdown Menu

Context menus and action menus. Used in:

- App card kebab menu (Edit, View logs, Delete)
- Data table row actions
- Sidebar bottom (admin profile: account, logout)

Keep to 5 items maximum. Destructive actions always at the bottom, separated by a `Separator`.

### Empty

Shown when a data table or list has no rows.

Structure:
```
[Icon — Lucide, 48px, muted]
Heading: short noun phrase ("No deployments yet")
Description: one sentence with next action hint
[CTA button — optional]
```

Use `PackageOpen` for apps, `Server` for services, `Files` for storage, `Clock` for logs.

### Field

Form field wrapper combining label, input, hint text, and error message. Used across all form surfaces.

- Label: always visible (never placeholder-only labels)
- Hint: `muted-foreground`, below the input
- Error: `destructive`, replaces hint on invalid state
- Required indicator: `*` in `destructive` color appended to label

### Hover Card

Preview on hover for: app names in tables (shows subdomain + created date), admin emails (shows role + last active), API key IDs (shows app + created date).

Trigger: underlined text link. Card appears after 300ms delay.

### Input / Input Group

Standard text input. NubleStation uses `rounded-md` on inputs (not pill — pills are for buttons only).

`InputGroup` combines an icon or prefix label with an input:

```
[ 🔍 ] Search apps...
[ api. ] clinic.local
[ nbl_ ] API key prefix display
```

Use `InputGroup` for: search bars, domain/subdomain fields, API key display.

### Kbd

Keyboard shortcut display. Used in:

- Empty state tips ("Press `N` to create a new app")
- Tooltip shortcuts
- `/watch` log filter documentation

```tsx
<Kbd>⌘ K</Kbd>
<Kbd>N</Kbd>
```

### Navigation Menu

The sidebar is built on `NavigationMenu`. Primary nav items:

| Item | Icon (Lucide) | Route |
|---|---|---|
| Dashboard | `LayoutDashboard` | `/dashboard` |
| Watch | `Activity` | `/watch` |
| Apps | `AppWindow` | `/apps` |
| Network | `Network` | `/network` |
| Storage | `HardDrive` | `/storage` |
| Audit | `ClipboardList` | `/audit` |
| Admins ① | `Users` | `/admins` |
| Settings ① | `Settings` | `/settings` |

① Visible to `super_admin` role only.

Active item: `bg-muted` background, `text-primary` color, `font-medium`. Inactive: `text-muted-foreground`.

### Pagination

Used on: data tables with > 25 rows, file browser, deployment history.

- Always show: previous, page numbers (max 5 visible), next
- Show total count: "Showing 1–25 of 143"
- URL-driven: `?page=2` — not client state

### Progress

Used for:

| Context | Style |
|---|---|
| Storage disk usage bar | Filled, color shifts: green → amber → red by % |
| Deploy upload progress | Indeterminate spinner until server confirms |
| Migration running | Indeterminate |

All progress bars use `rounded-full`.

### Separator

Horizontal rule between sections. Used in:

- Sidebar between nav groups and profile section
- Dropdown menus before destructive actions
- Settings page between sections (Org info / Network / Secrets)

Use `text-muted-foreground` for labeled separators ("Danger zone").

### Skeleton

Loading placeholder matching the shape of the content it replaces.

- Dashboard service grid: skeleton cards at `rounded-3xl`
- Tables: skeleton rows at full width
- App cards in `/apps`: skeleton at card dimensions

Never show spinners for page-level loading — use skeletons instead.

### Sonner (Toast)

Feedback for async operations. Position: bottom-right.

| Operation | Variant | Message |
|---|---|---|
| Deploy success | `success` | "tasks deployed — live at tasks.clinic.local" |
| Deploy failed | `error` | "Deploy failed: zip exceeds 50 MB limit" |
| Session expired | `warning` | "Session expired — please sign in again" |
| Key revoked | `default` | "API key revoked" |
| Settings saved | `success` | "Changes saved" |

Duration: 4s for success, 6s for error (give time to read). Never auto-dismiss errors that require action.

### Spinner

Inline loading indicator for button loading states and inline async feedback.

- Button loading: replace button label with `<Spinner />` + "Deploying…"
- Never use spinner for full-page or skeleton-replaceable loading

### Table

Base table primitive used by `DataTable`. Used directly (without pagination) for:

- App detail tabs with < 10 rows (small API key list, migration history)
- Settings read-only fields (network topology, schema version)

Header: `text-muted-foreground`, `text-xs`, `uppercase`, `tracking-wider`. Row hover: `bg-muted/50`.

---

## Component Usage by Route

| Route | Components |
|---|---|
| `/auth` | Card, Input, Button (`lg`), Sonner |
| `/dashboard` | Card, Badge, Chart (area, radial), Skeleton, Separator |
| `/watch` | Badge, Separator, Input (search/filter), Spinner, Kbd |
| `/apps` | Card, Badge, Button, DataTable, Empty, Drawer, Sonner |
| `/apps/:app` | Breadcrumb, Tabs, DataTable, Badge, Button, HoverCard, Sonner, Empty, Progress |
| `/admins` | DataTable, Avatar, Badge, AlertDialog, Button, Drawer, Sonner |
| `/audit` | DataTable, Badge, Avatar, Pagination, Input (filter) |
| `/settings` | Card, Input, Field, Button, AlertDialog, Separator, Sonner |
| `/network` | Card, Badge, Table, Separator |
| `/storage` | Chart (bar), DataTable, Progress, Drawer (file preview), Empty |

---

## Do / Don't

| Do | Don't |
|---|---|
| Use pill buttons (`rounded-full`) for all buttons | Use squared or rounded-md buttons |
| Use `rounded-3xl` cards for all content containers | Use sharp or `rounded-lg` cards |
| Use brand purple `#5F55F0` as the single accent | Introduce secondary accent colors |
| Use Lucide icons at `size-4` (16px) inline, `size-5` (20px) nav | Mix icon libraries |
| Use `sonner` for async feedback | Use `alert` components for transient feedback |
| Use skeletons for loading states | Use full-page spinners |
| Keep destructive actions at the bottom of dropdowns | Place destructive actions inline with normal actions |
| Label every form input visibly | Use placeholder text as the only label |
