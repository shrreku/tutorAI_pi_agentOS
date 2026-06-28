# Archived Design Lab

This directory preserves the last Design Lab source from the former frontend,
copied from commit `e1a5071` on `codex/folio-revamp-foundation`.

The Folio direction is implemented in
[`src/design-lab/directions/folio.tsx`](./src/design-lab/directions/folio.tsx),
with its shared layout, nodes, surfaces, primitives, workspace, and styles beside it.
The other directions are retained because the original Design Lab shared those modules
and used them for side-by-side comparison.

This is an implementation reference, not production code or a standalone supported app.
Its data module imports routing and query helpers from the deleted frontend, and its
dependencies reflect the historical web package. Use it to recover visual and interaction
decisions; rebuild data access through `@studyagent/api-client` and current shared schemas.
