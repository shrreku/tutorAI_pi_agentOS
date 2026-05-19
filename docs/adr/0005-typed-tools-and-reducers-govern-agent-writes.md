# ADR-0005: Typed Tools And Reducers Govern Agent Writes

Status: Accepted

Date: 2026-05-15

## Context

The tutor can create claims, artifacts, coverage updates, planning changes, student-profile updates, and session-plan changes. Letting free-form model output mutate durable state would make notebook state unauditable and difficult to test.

Current code already routes runtime capabilities through `ToolRegistry`, Zod schemas, side-effect classes, provider implementations, reducer metadata, and durable events.

## Decision

Durable LLM-originated writes must flow through registered StudyAgent tools with typed input/output schemas, side-effect classification, notebook-scoped providers, reducer validation, reducer results, and emitted events.

Free-form tutor text may explain or suggest, but it must not claim durable state changes unless a tool applied them.

## Consequences

- Every new agent capability needs a tool contract and tests.
- Tool execution can be traced, budgeted, validated, and audited.
- Product state changes can be replayed or inspected through reducer result metadata and event IDs.
- The system can distinguish read-only retrieval, candidate writes, state updates, published writes, and external writes.

## Current Implementation

- `packages/tools/src/index.ts` registers and executes tools with validation, timeout handling, lifecycle events, and alias normalization.
- `packages/tools/src/writes.ts` defines write tool schemas and reducer-result outputs.
- `apps/api/src/tutor-write-provider.ts` implements DB-backed write providers.
- `packages/schemas/src/tools.ts` defines shared side-effect and reducer-result contracts.

## References

- `docs/contexts/api-runtime/CONTEXT.md`
- `greenfield-studyagent/docs/07-api-events-tools.md`
- `greenfield-studyagent/docs/12-planning-state-tools-and-pedagogical-artifacts.md`
