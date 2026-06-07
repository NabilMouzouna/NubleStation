# LAN Speed Test (`speedtest.{org}.local`)

A browser-based network speed test for the LAN — like the Google / Ookla speed
tester, but **fully offline**. Any device on the network opens
`http://speedtest.{org}.local` and measures **download, upload, ping, and jitter**
against the NubleStation host.

## Why it exists

Clinic IT and developers need a zero-install way to sanity-check LAN health from any
device (a nurse's tablet, a phone, a laptop) — "is the network the bottleneck, or
the app?". Public speed testers (Ookla, Google) measure the path to the *internet*,
which is irrelevant on an air-gapped LAN and unavailable when the uplink is pulled.
This measures the path that actually matters: **device ↔ host, over the LAN**.

## What it is

We use the prebuilt [OpenSpeedTest](https://openspeedtest.com/) container — a
stateless, pure-HTML5/JS speed test with no backend dependencies, database, or
internet requirement. It is dropped in as a Compose service; no custom code.

## Topology

```
Phone → DNS (CoreDNS, :53)  → host IP          (wildcard *.{org}.local)
Phone → HTTP (Caddy, :80)   → openspeedtest:3000  (internal network only)
```

| Piece | Config |
|---|---|
| DNS | No change — the CoreDNS wildcard template already resolves every `*.{org}.local` to the host IP. |
| Reverse proxy | `speedtest.{org}.local:80` block in `infra/caddy/Caddyfile` → `openspeedtest:3000`. Also added to the `@notReserved` exclusion so the deployed-app catch-all never claims it. |
| Service | `openspeedtest` in `infra/docker-compose.yml`. Image `openspeedtest/latest`, `expose: 3000`, on the `nuble` network. Stateless — no volumes, env, or DB. |

Like every other service, it is reachable on the LAN **only through Caddy** — the
container itself is not published to any host port.

## Caveat

The measurement is browser ↔ host **through Caddy's reverse proxy**, not raw
NIC-to-NIC. For diagnosing LAN/app performance this is exactly the number you want
(it reflects the real request path). For raw link-layer throughput benchmarking,
`iperf3` between two hosts is the more precise tool.

## Usage

From any device configured to use the host for DNS (see [dns-doctor](./dns-doctor.md)):

```
http://speedtest.{org}.local
```

Press **Start**. No login, no setup.

## Console integration — the Bandwidth card

The Network page in Console (`app/(shell)/network/`) has a **Bandwidth** card that
runs the test *inside* the dashboard rather than linking out. Rather than iframe the
OpenSpeedTest UI (which can't hand its results back), a small client widget
(`_bandwidth-card.tsx`) drives the container's data endpoints directly and computes
throughput in the browser — so the numbers are ours to display and keep.

- **Endpoints used:** `GET /downloading` (30 MB incompressible payload) and
  `POST /upload` (sink), both on `speedtest.{org}.local`, served with
  `Access-Control-Allow-Origin: *` and `no-transform` so cross-origin reads from
  `console.{org}.local` work and the garbage isn't gzipped.
- **Method:** ping/jitter from request RTT, then download and upload each measured
  over an 8 s window across 4 parallel streams with a 1.5 s warm-up discarded (TCP
  slow-start). All HTTP/application layer — no ICMP, no raw sockets.
- **History:** the last 8 runs are kept in `localStorage` (`nuble.speedtest.history`)
  — intentionally client-side only, no platform DB table. Each device keeps its own
  history, which matches "is *this* tablet's link healthy?".
- **Credit:** the card footer links back to OpenSpeedTest.

The full standalone UI remains available at `speedtest.{org}.local` (linked from the
card header).
