# Architecture Deepening Program (Parent Issue Template)

Use this body when publishing the HITL parent issue for Ticket 1. Link every child ticket (#2–#24) from the architecture deepening program.

## Accepted modules (order of work)

1. Tutor Turn — executable turn harness, persistence, streaming projection, crystallization.
2. Reference Surface — learner-facing surfaces, artifact rendering, Evidence read shape.
3. Source-to-LLM-Wiki Compilation — wiki change sets, human blocks, claim resolution.
4. Workspace Read Model — Study Map, Source Wiki topics, learner visibility.
5. Artifact Lifecycle — transitions, consent, quality gates, tool-write policy.
6. Graph Projection — canonical projection, rebuild, health/lag.
7. Tool Contract — catalog, Pi/runtime metadata, reducer validation.

## ADRs in force

Accepted ADRs in `docs/adr/` remain authoritative. This program deepens module boundaries; it does not reopen ADR decisions unless a separate ADR change is approved.

## Migration rules

- Keep compatibility fallbacks only while a dependent ticket is still open.
- Remove fallbacks in Ticket 24 (final integration) once upstream module tests pass.
- If a fallback must remain after Ticket 24, document the owner and reason in this parent issue.

## Parallel work (after Ticket 1)


| Track                | Tickets                             |
| -------------------- | ----------------------------------- |
| Tutor Turn           | 2 → 3 ∥ 4 → 5                       |
| Reference Surface    | 6 → 7, 8                            |
| Wiki compilation     | 9 → 10, 11                          |
| Workspace read model | 12 → 13 → 14                        |
| Artifact lifecycle   | 15 → 16 → 17                        |
| Graph projection     | 18 → 19 → 20                        |
| Tool contract        | 21 → 22 → 23                        |
| Final integration    | 24 (after 5, 8, 11, 14, 17, 20, 23) |


## Index

- Implementation tickets: `docs/architecture/architecture-deepening-implementation-tickets.md`
- Product alignment follow-ups: `docs/architecture/product-alignment-and-mastery-evaluator-implementation-tickets.md`