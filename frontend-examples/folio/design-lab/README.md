# Folio Design Lab

Portable Folio design lab — the branch's only frontend visual reference.

Includes the full Folio webapp prototype:

- **Landing pages** — hub plus journal, tutor, and library variants (`#folio/landing/…`)
- **Navigation drawer** — editorial rail, drawer, and forest variants (switcher in the shell)
- **Learner shell** — dashboard, notebooks, account, workspace, node pack

Run from the repository root:

```bash
pnpm install
pnpm design-lab
```

Then open:

- `http://127.0.0.1:4174/#folio/landing` — landing picker
- `http://127.0.0.1:4174/#folio/dashboard` — journal dashboard with nav shell
- `http://127.0.0.1:4174/#folio/notebooks/demo-orgchem` — workspace

Hash routes are rooted at `#folio/…`. All data is portable mock content in
`src/design-lab/lib/folio-mock-data.ts` — no API required.

`apps/web/` is a clean-room placeholder for future production implementation.
