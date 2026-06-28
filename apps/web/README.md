# StudyAgent Web — Clean Room

This directory is the clean frontend implementation surface for the outsourced Folio build.
The previous frontend remains available in Git history on
`codex/folio-revamp-foundation` at commit `e1a5071`.

## Internal foundations

- Use `@studyagent/api-client` for browser HTTP and stream operations.
- Use `@studyagent/schemas` for runtime-validated contracts.
- Treat `docs/frontend/` and `docs/contexts/` as product behavior requirements.
- Treat `frontend-examples/folio/` as visual reference material, not production code.

## Rules

- Do not copy modules from the previous `apps/web` implementation.
- Do not call `fetch` outside `@studyagent/api-client`.
- Do not import API, database, worker, graph, tutor-runtime, or eval-runner implementations.
- Do not introduce sample data paths into production routes.
- Preserve authentication, entitlement, Beta Consent, Notebook ownership, Evidence,
  Artifact, Practice, Interactive Learning, and MCP App behavior through validated contracts.
- Implement the route and state matrix in `docs/frontend/15-folio-end-to-end-implementation-plan.md`.

## Commands

```bash
pnpm --filter @studyagent/web dev
pnpm --filter @studyagent/web check
pnpm --filter @studyagent/web build
```

The current application intentionally renders only a clean-room marker. Product routes and
visual implementation belong to the outsourced frontend program.
