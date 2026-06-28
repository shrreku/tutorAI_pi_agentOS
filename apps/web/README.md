# StudyAgent Web — Folio Clean Room

Production Folio frontend for StudyAgent. Branch: `feat/folio-production-revamp` from `codex/folio-clean-frontend`.

## Foundations

- `@studyagent/api-client` — all browser HTTP (no direct `fetch` in features)
- `@studyagent/schemas` — validated contracts and Workspace URL codec helpers
- `frontend-examples/folio/design-lab/` — **sole** Folio tokens, primitives, and visual reference
- `docs/contexts/web-workspace/CONTEXT.md` — architecture decisions and glossary

Production routes are **unstyled scaffolds** until design tokens are promoted from the design lab.

## Dev

```bash
pnpm --filter @studyagent/api dev
pnpm --filter @studyagent/web dev
pnpm design-lab   # visual reference on :4174
```

## F01 scaffold

TanStack Router, session guards, route map, placeholder pages. No Folio design tokens in this package.
