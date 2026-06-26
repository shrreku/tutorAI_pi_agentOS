# ADR-0023: Product Validation Observability And Analytics

Status: Accepted

Date: 2026-06-17

## Context

StudyAgent already has operational telemetry through Prometheus-style metrics, request correlation, optional Langfuse traces, durable notebook events, and runtime/developer timeline surfaces. Hosted product validation needs a separate way to measure activation, retention, credit use, feedback, onboarding friction, and user-reported issues.

The product test also intentionally uses identified analytics and replay to make follow-up and UX diagnosis easier, while keeping source content, tutor transcripts, uploaded files, and private learning-state detail out of analytics payloads unless a learner explicitly includes them in a support context.

## Decision

Use first-party Product Analytics Events as the source of truth for activation and product validation. Mirror selected sanitized events to PostHog as the first Analytics Mirror. PostHog may receive identified learner properties such as name and email for product follow-up, but it must not receive uploaded source contents, tutor transcripts, raw private learning-state detail, or source text as ordinary analytics properties.

Enable Study Workspace Replay where the free plan allows it, with privacy masking configured before launch. Replay is allowed for onboarding and actual workspace usage, but replay is not the product analytics source of truth. If replay reaches the free monthly limit or billing cap, stop replay capture for the month while first-party Product Analytics Events continue.

Use Sentry for Error Monitoring across web, API, and worker processes. Keep Sentry distinct from PostHog Product Analytics, Langfuse LLM traces, Prometheus metrics, and durable notebook events.

Define the core product validation metric as Activated Learner: a logged-in learner who starts from a Study Template, completes at least one tutor session with a Mastery Check or quiz interaction, and submits Learning Feedback.

## Consequences

- Product analytics remain queryable in StudyAgent even if PostHog is changed or disabled later.
- Identified analytics and replay increase privacy obligations and require clear Beta Consent before app entry.
- PostHog is used for funnels, cohorts, dashboards, and replay; it is not used as the canonical event store.
- Sentry provides release-aware exception tracking that logs, PostHog, Langfuse, and metrics do not replace.
- First-entry Beta Consent must disclose experimental AI behavior, identified analytics, replay, third-party processing, feedback use, and non-use for high-stakes educational decisions.

## References

- `docs/adr/0019-observability-telemetry-seam.md`
- `docs/contexts/product-domain/CONTEXT.md`
- `docs/contexts/api-runtime/CONTEXT.md`
- PostHog
- Sentry
- Langfuse

