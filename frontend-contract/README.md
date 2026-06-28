# Frontend Contract Kit

This directory routes outsourced frontend work to the authoritative StudyAgent contracts.
It intentionally contains no legacy frontend implementation.

## Product and architecture

- [`PRODUCT.md`](../PRODUCT.md)
- [`docs/contexts/product-domain/CONTEXT.md`](../docs/contexts/product-domain/CONTEXT.md)
- [`docs/contexts/web-workspace/CONTEXT.md`](../docs/contexts/web-workspace/CONTEXT.md)
- [`docs/adr/0027-folio-replaces-legacy-frontend.md`](../docs/adr/0027-folio-replaces-legacy-frontend.md)
- [`docs/adr/0029-react-vite-tanstack-fastify-folio-foundation.md`](../docs/adr/0029-react-vite-tanstack-fastify-folio-foundation.md)

## Delivery contract

- [`docs/frontend/14-folio-production-architecture.md`](../docs/frontend/14-folio-production-architecture.md)
- [`docs/frontend/15-folio-end-to-end-implementation-plan.md`](../docs/frontend/15-folio-end-to-end-implementation-plan.md)
- [`docs/frontend/16-folio-ticket-drafts.md`](../docs/frontend/16-folio-ticket-drafts.md)
- [`frontend-examples/folio/`](../frontend-examples/folio/)

## Internal code that survives the reset

- `@studyagent/schemas`: shared runtime contracts.
- `@studyagent/api-client`: browser transport, validation, errors, query keys, and streams.
- Fastify routes and bounded read models in `apps/api`.
- Durable state and domain implementations outside `apps/web`.

## Legacy baseline

The removed implementation is preserved on branch `codex/folio-revamp-foundation`
at commit `e1a5071`. Use it only to identify observable behavior and missing contract
coverage. Do not copy its module structure or presentation code into the clean frontend.
