---
title: Introduction
description: What NubleStation is, what problem it solves, and who it's for.
---

NubleStation is a **self-hosted, plug-and-play backend infrastructure platform** for small organizations. Think of it as a "Synology NAS for developers" — install it once on any machine on your LAN and every developer on the network gets:

- A shared auth service (SSO across every app)
- A multi-tenant database with enforced per-app isolation
- A file storage service
- Frontend hosting for single-page apps
- Stable subdomains for everything (`console.org.local`, `tasks.org.local`, …)

All of this works **without internet access** — critical for environments like clinics where patient data cannot leave the premises.

## The problem

| Existing solution | Why it fails for clinics |
|---|---|
| Firebase / Supabase Cloud | Patient data cannot leave premises (compliance) |
| Self-hosted Supabase / Appwrite | Requires DevOps expertise the clinic doesn't have |
| PocketBase / single-binary tools | No multi-app isolation, no LAN-native networking |
| Custom servers per app | Heavy footprint, no shared services, no SSO |

**The gap:** no solution combines BaaS services + LAN-native networking + plug-and-play installation in a single product deployable on commodity hardware in under ten minutes.

## Who is it for?

NubleStation's primary target is a **clinic with 10–50 staff** where:

- A small IT department (or none) manages the network
- Developers build internal apps (scheduling, records, billing, etc.)
- All devices are on the same LAN
- Data sovereignty is a hard requirement

The platform fits any organization with a similar profile: law firms, small hospitals, schools, or any team that wants a private cloud without cloud bills.

## What NubleStation is not

NubleStation is intentionally narrow. It does not:

- Run on multiple machines / clusters (single-host Docker Compose only)
- Replace a cloud provider for internet-facing products
- Handle real-time streaming video, IoT telemetry at scale, or ML inference
- Provide a hosted service — you bring your own hardware

If you need any of those, NubleStation is the wrong tool.

## Design principles

1. **Ops-first.** The networking shell (Caddy, CoreDNS, Compose) ships before the service layer is complete.
2. **One process per container.** Standard Docker practice — independent restarts, independent resource limits, readable logs.
3. **Apps are database rows, not containers.** Creating an app inserts a row and issues an API key. No process is spawned.
4. **Authorization at the platform layer.** The `user_app_access` table + middleware enforce access. App developers cannot bypass it.
5. **Offline-first by default.** Every component is licensed for on-premises use; nothing phones home.

## Next steps

- [Install NubleStation](/getting-started/installation/) on your machine
- Read the [Architecture overview](/concepts/architecture/) to understand how everything fits together
