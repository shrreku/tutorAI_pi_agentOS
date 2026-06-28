# Folio Design Lab

This directory contains the branch's sole visual frontend reference: a portable
Folio Design Lab derived from commit `e1a5071` on `codex/folio-revamp-foundation`.

Folio is implemented in
[`src/design-lab/directions/folio.tsx`](./src/design-lab/directions/folio.tsx),
with its shared layout, nodes, surfaces, primitives, workspace, and styles beside it.

Run it from the repository root:

```bash
pnpm design-lab
```

Then open `http://127.0.0.1:4174/#folio/workspace`. The example uses portable sample
data so an outsourced team can run it without the StudyAgent API. It remains an
implementation reference, not production code; rebuild data access through
`@studyagent/api-client` and current shared schemas.
