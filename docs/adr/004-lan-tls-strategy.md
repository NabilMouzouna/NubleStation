# ADR 004 — LAN TLS Strategy

**Status:** Accepted
**Date:** 2026-05-20
**Tags:** infra

## Context

NubleStation runs entirely on a private LAN under a `.local` domain (e.g. `*.clinic.nuble.local`). All traffic between clinic devices and the API Gateway passes over this network. Without TLS, the `Authorization` header (which carries the app's API key) is sent in plaintext — any device on the LAN can intercept it via a MITM attack.

Public certificate authorities (Let's Encrypt) cannot issue certs for `.local` domains because there is no public DNS challenge possible. This means standard automatic HTTPS does not work out of the box.

Three options were considered.

## Options

### Option A — Caddy internal CA + onboarding cert installation (chosen)

Caddy runs its own internal CA and issues a wildcard cert for `*.{org}.local`. During the NubleStation setup wizard (first-time admin onboarding), every device is walked through installing Caddy's root CA certificate before they can proceed.

The console exposes a shareable **"Device Setup"** page with OS-specific instructions (Windows, macOS, Linux, Android, iOS) that clinic staff can open on their own device.

| Concern | Result |
|---|---|
| Requires internet | No — fully offline after install |
| Per-device work | Yes — one-time CA install per device |
| User friction | Low if embedded in onboarding flow |
| Real domain needed | No |
| Cert renewal | Caddy handles it automatically |

### Option B — Real domain + DNS-01 ACME (Let's Encrypt wildcard)

Admin owns a real domain (e.g. `clinic.example.com`). At install time, Caddy uses the DNS-01 challenge to get a valid Let's Encrypt wildcard cert. CoreDNS resolves `*.clinic.example.com` to the local IP (split-horizon DNS). Devices trust the cert automatically — no CA installation needed.

| Concern | Result |
|---|---|
| Requires internet | Yes — at install and every 90 days for renewal |
| Per-device work | None |
| User friction | None after setup |
| Real domain needed | Yes (~$10/year) |
| Cert renewal | Needs internet every 90 days |

### Option C — Plain HTTP (no TLS)

Skip TLS entirely. Accept that API keys are transmitted in plaintext on the LAN.

Rejected immediately — violates the security model. A compromised device on the same network can read every API key in transit.

## Decision

**Option A** — Caddy internal CA with onboarding-guided cert installation per device.

Option B is cleaner from a UX perspective but introduces an internet dependency for renewal and requires the admin to own a domain, which cannot be assumed for all clinics. The offline-first constraint is non-negotiable (defense demo: internet unplugged, system still works).

Option A keeps NubleStation fully self-contained. The one-time CA install is a known, solved UX pattern (mkcert, Smallstep, and internal enterprise CAs all use this model). Embedding it in the setup wizard makes it unavoidable rather than a buried docs step.

## Staging Finding (2026-05-25)

TLS is also a prerequisite for **session cookies**. The Next.js Console sets the `HttpOnly` session cookie with `Secure: true` when built in production mode. Because `process.env.NODE_ENV` is inlined as the string `"production"` at `next build` time, the runtime environment variable cannot override it — the flag is always present in production images. A browser on plain HTTP will not store a `Secure` cookie, so the session is lost immediately after login. Without TLS, the admin cannot stay logged in to the Console.

This adds urgency to implementing Option A (Caddy internal CA). Until TLS is in place, a workaround env var (`SECURE_COOKIES`) controls the flag, but this is a temporary measure only.

## Consequences

- The NubleStation setup wizard must include a **mandatory "Trust this device" step** before any API calls are made.
- The console must expose a `/setup/device` page with OS-specific CA install instructions, shareable with clinic staff.
- Caddy config must explicitly enable the internal CA and issue a wildcard cert for `*.{org}.local`.
- Devices that skip the CA install will see browser cert warnings — the console should detect this and block usage until resolved.
- CI/demo: the travel router demo works offline; the cert is already trusted on the demo devices before the presentation.
