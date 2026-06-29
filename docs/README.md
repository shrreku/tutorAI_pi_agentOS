# StudyAgent Documentation

Start here instead of scanning every historical plan.

## Current Documentation

| Area                                            | Source of truth                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| Product intent                                  | [`PRODUCT.md`](../PRODUCT.md)                                        |
| Domain language and context boundaries          | [`CONTEXT-MAP.md`](../CONTEXT-MAP.md) and [`contexts/`](./contexts/) |
| Durable architecture decisions                  | [`adr/README.md`](./adr/README.md)                                   |
| Current architecture map and active design work | [`architecture/README.md`](./architecture/README.md)                 |
| Folio frontend implementation                   | [`frontend/README.md`](./frontend/README.md)                         |
| Hosted-beta operations                          | [`deployment/`](./deployment/)                                       |
| Agent workflow conventions                      | [`agents/`](./agents/)                                               |

Code, shared schemas, migrations, and tests remain authoritative for implemented behavior. Documentation explains product language, intent, and decisions; it must not override a conflicting runtime contract.

## Archive Policy

Completed plans, local ticket drafts, dated audits, superseded explorations, and inactive proposals live in [`archive/`](./archive/). Archiving a document does not reverse an accepted ADR or remove implemented behavior. It only means the document is no longer an active planning source.

Keep a document in the current tree when it is one of:

- a domain glossary or context map;
- an accepted or explicitly superseded ADR;
- an operational runbook;
- documentation for active implementation work;
- the single current design document for an unresolved track.

GitHub Issues is the issue tracker. Local implementation-ticket files under `docs/` should exist only as temporary publishing packets for active planning work; publish approved work as GitHub Issues before assigning implementation.
