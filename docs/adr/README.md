# Architecture Decision Records

ADRs record durable or costly-to-reverse decisions. They remain in the active log even when superseded so later work can recover the trade-off and the reason it changed.

## Decision Index

| Range                                                                                                                                                    | Area                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [ADR-0001](./0001-notebook-scoped-learning-workspace.md)–[ADR-0013](./0013-mastery-evaluator-produces-durable-evidence-reducers-apply-learning-state.md) | Notebook, knowledge, tutoring, events, search, Workspace, artifacts, sessions, and mastery foundations |
| [ADR-0014](./0014-synthetic-learner-evals-use-black-box-golden-journeys.md)–[ADR-0016](./0016-layered-llm-synthetic-learner-modes.md)                    | Synthetic Learner evaluation strategy                                                                  |
| [ADR-0017](./0017-llm-assisted-learner-trait-estimates.md)–[ADR-0021](./0021-rolling-wiki-and-curriculum-generation-lifecycle.md)                        | Learner traits, coordination, observability, Interactive Learning, and rolling generation              |
| [ADR-0022](./0022-hosted-beta-access-identity-and-entitlements.md)–[ADR-0025](./0025-portable-knowledge-bundles-as-okf-profile.md)                       | Hosted beta, product analytics, ingestion, and portable knowledge                                      |
| [ADR-0026](./0026-tailwind-shadcn-parallel-ui-rewrite.md)                                                                                                | Superseded by ADR-0027; retained as decision history                                                   |
| [ADR-0027](./0027-folio-replaces-legacy-frontend.md)–[ADR-0029](./0029-react-vite-tanstack-fastify-folio-foundation.md)                                  | Folio cutover, Study Activity, and frontend foundation                                                 |

Accepted ADRs remain constraints until another ADR explicitly amends or supersedes them. Implementation plans and ticket drafts referenced by older ADRs may be archived; those references are historical evidence, not active work queues.
