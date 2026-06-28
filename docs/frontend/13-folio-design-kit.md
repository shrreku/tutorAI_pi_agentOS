# Folio Design Kit

Folio is TutorBook's sole production visual direction. The runnable
[`frontend-examples/folio/design-lab/`](../../frontend-examples/folio/design-lab/README.md)
is the only visual reference retained on this branch.

## Run the reference

```bash
pnpm install
pnpm design-lab
```

Open `http://127.0.0.1:4174/#folio/workspace`.

The Design Lab contains three representative surfaces:

- Dashboard
- Notebook Workspace
- Node Pack

It uses portable sample data so external implementers can run it without StudyAgent
credentials or backend services. Sample values are illustrative only. Production data
must come through `@studyagent/api-client` and shared schemas.

## Visual language

- Warm editorial ivory backgrounds and opaque reading surfaces.
- Forest and sage accents for actions, selected state, and progress.
- Newsreader for display and long-form reading.
- Inter for controls, labels, and general UI text.
- JetBrains Mono for compact metadata and locators.
- Warm hairline borders, restrained shadows, and six-pixel base radii.
- Numbered figure-like Study Map nodes in the Folio Workspace.

The authoritative tokens and implementation examples live in:

- [`styles.css`](../../frontend-examples/folio/design-lab/src/design-lab/styles.css)
- [`folio.tsx`](../../frontend-examples/folio/design-lab/src/design-lab/directions/folio.tsx)
- [`margin.tsx`](../../frontend-examples/folio/design-lab/src/design-lab/ui/layouts/margin.tsx)
- [`nodes.tsx`](../../frontend-examples/folio/design-lab/src/design-lab/ui/nodes.tsx)
- [`workspace.tsx`](../../frontend-examples/folio/design-lab/src/design-lab/ui/workspace.tsx)
- [`surfaces.tsx`](../../frontend-examples/folio/design-lab/src/design-lab/ui/surfaces.tsx)

## Production interpretation

The Design Lab defines visual and interaction intent, not application architecture.
The production frontend must still implement every route, loading state, empty state,
error state, responsive state, authorization rule, stream behavior, and durable learner
outcome in the numbered frontend specifications.

Do not:

- copy sample data into production;
- add another theme or runtime theme switcher;
- reintroduce deleted screenshot, Pencil, static-preview, or layout-variation archives;
- bypass `@studyagent/api-client` with feature-local HTTP wrappers;
- treat Design Lab component structure as a required production module structure.

Routes and states not shown in the Design Lab should extend the same Folio tokens,
typography, spacing, and interaction language.
