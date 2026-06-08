# Bandwidth Card — Console Network page

**Commit:** `83de38f`
**Branch:** `feature/blaze`
**Date:** 2026-06-08

## What was built

| File | Role |
|---|---|
| `apps/console/app/(shell)/network/_bandwidth-card.tsx` | Client widget: gauge + measurement + localStorage history |
| `apps/console/app/(shell)/network/page.tsx` | Renders `<BandwidthCard domain={domain} />` below the subdomains table |
| `docs/documentation/speedtest.md` | Added "Console integration — the Bandwidth card" section |

## Key decisions

- **Not an iframe.** OpenSpeedTest's UI can't hand results back, so the widget drives the container's `/downloading` + `/upload` endpoints directly and computes Mbps in-browser — we own the numbers.
- **localStorage, no DB.** User chose ephemeral/client-side history (`nuble.speedtest.history`, last 8). No platform table, no migration, no API route. Per-device history matches "is *this* tablet's link healthy?".
- **Measurement:** ping/jitter from request RTT; download/upload over an 8 s window × 4 parallel streams, 1.5 s warm-up discarded. All application-layer HTTP.
- **CORS confirmed** before building: endpoints return `Access-Control-Allow-Origin: *` + `no-transform`, so cross-origin reads from `console.{org}.local` work and garbage isn't gzipped.
- **Credit:** "Powered by OpenSpeedTest" footer link (user-requested).

## Verification

- `eslint` clean (`LINT=0`) on the new file.
- `tsc` shows only the repo-wide pre-existing `TS2742` `@types/react` portability noise (hits every page/component, including already-committed `layout.tsx`); does not block Next build.
- Not yet rebuilt into the running console image — needs a console image rebuild to see live.
