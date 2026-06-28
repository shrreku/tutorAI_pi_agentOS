# Folio routes (`apps/web/src/routes`)

TanStack Router file routes for the production Folio frontend. Generated tree: `src/routeTree.gen.ts`.

## Layout boundaries

| Route prefix | Guard | Purpose |
| --- | --- | --- |
| `/`, `/login`, `/demo`, … | Public | Marketing + auth entry |
| `/_learner/*` | Session + consent `beforeLoad` | Learner shell |
| `/_learner/notebooks/$notebookId` | Same | Notebook Workspace (F07+) |

## Learner URLs (grill decisions)

- `/app` — learner home placeholder until F16 Learner Dashboard Summary
- `/app/notebooks` — notebooks list (F03+)
- `/app/templates` — template discovery (F03)
- `/app/account/$tab` — account tabs; legacy `/app/credits` etc. redirect here
- `/notebooks/:notebookId` — study workspace + Workspace URL Codec search params

## Slice status

- **F01 (this scaffold):** router, api-client, tokens/primitives, public shell, route map, placeholders
- **F02:** consent, onboarding gate, dev login, learner chrome modules
- **F03:** templates + workspace create + notebooks list
- **F07:** workspace shell
- **F16:** learner home content

Visual reference: `frontend-examples/folio/design-lab/` (not imported by production routes).
