# ADR 002 — Console design system: Meta-inspired tokens

**Status:** Accepted
**Date:** 2026-05-10

## Context

The Console (Next.js admin dashboard at `console.{org}.local`) is the only surface end users — clinic admins, IT, developers deploying apps — see directly. It needs a coherent design system before component work begins. Building one from scratch costs weeks; importing a full off-the-shelf kit (shadcn/ui, Mantine) gives speed but no brand identity that matches the "private cloud appliance" positioning.

## Decision

Adopt a **Meta-inspired token system** as Console's foundation: pill buttons (`rounded.full` 100px), a stark white canvas, a single saturated cobalt accent (`#0064E0`) for primary action, an Optimistic VF–style display face with `ss01`/`ss02` stylistic sets, a 4px spacing base, and `rounded.xxxl` (32px) card geometry as the dominant signature.

## Rationale

| Concern | From scratch | Stock UI kit | Meta-inspired tokens |
|---|---|---|---|
| **Time to first component** | Weeks | Hours | ~1 day to wire tokens |
| **Brand identity** | Whatever ships | Generic | Confident hardware-merchandiser voice — fits "Synology NAS for developers" |
| **Token discipline** | Risk of drift | Imposed by library | Imposed by this ADR |
| **Surface fit for admin** | TBD | Neutral | Good once commerce surfaces are stripped |

NubleStation is positioned as a hardware appliance for clinics. Meta's hardware-commerce voice — dark-pill CTA on stark white, single cobalt accent, photography-light cards — translates cleanly to an infrastructure console. The pill + `rounded.xxxl` card pairing is the recognizable signature carried across.

## Adaptations

The reference spec was a commerce design language. Console is admin software, so:

- **Primary CTA is the cobalt pill.** The dual-CTA pattern (black marketing pill + cobalt buy pill) collapses to one — Console has no marketing surface, every action is a "do it" affordance.
- **Drop:** promo strips, checkout summary cards, SKU pickers, product galleries, warranty cards, testimonial cards, promo banners, sale badges. None map to admin tasks.
- **Keep:** the button family, icon-feature cards, feature cards, text inputs, radio options, semantic badges (success/critical/attention/warning), accordion items, spec tables (reused as resource detail layouts), and the footer region.
- **Typography:** Optimistic VF is proprietary. Use Inter (or another open variable face that exposes equivalent stylistic sets) with the same `ss01`/`ss02` switching pattern; preserve the negative letter-spacing on body roles.
- **Dark mode:** flagged as a gap in the source spec. Deferred until 1.0 — clinic environments are bright and admin sessions are short.

## Consequences

- A `packages/design/` workspace exports tokens as CSS custom properties + a typed TS module, consumed by `apps/console`.
- The fallback variable typeface must be picked and committed before component work starts.
- Adopting this voice locks Console into pill buttons everywhere and `rounded.xxxl` cards — squared buttons or sharp cards will read as "third-party widget" against the rest of the surface.
- The reference DESIGN.md spec is removed in the same commit as this ADR; subsequent component work references this ADR and the `packages/design/` source as authoritative.

## References

- ADR 001 — separates Console as its own deployable surface, which is what justifies giving it a dedicated design identity.
