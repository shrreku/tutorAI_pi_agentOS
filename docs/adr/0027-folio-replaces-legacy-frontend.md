# ADR-0027: Folio Replaces the Legacy Frontend

Status: Accepted

Date: 2026-06-27

StudyAgent will ship one frontend generation: Folio. The migration removes the Legacy/Next runtime boundary, production Mist theme, theme switcher, provisional pages, and provisional CSS instead of retaining them as a fallback. Folio uses the approved local Design Lab baseline on the repository's existing Tailwind 3.4 and shared shadcn/Radix foundation. Existing API contracts and working product behavior remain authoritative; neither the Design Lab prototype nor the current frontend implementation is an architectural constraint.

"Remove Legacy" applies to the complete frontend implementation, not only its CSS. Existing components, hooks, contexts, handwritten routing, fetch wrappers, and dependencies may be replaced wholesale. The required preservation boundary is externally observable product behavior, domain semantics, API compatibility where retained, durable learner state, security/entitlement rules, and verified runtime outcomes. Existing code may be reused selectively when it lowers migration risk, but code reuse is not a goal.

API routes, shared schemas, route guards, SSE/AG-UI behavior, graph/read-model semantics, Reference Surface and Evidence contracts, Artifact lifecycle, ingestion status, entitlement rules, and MCP bridge behavior must remain working or be deliberately superseded by a tested production contract before their current frontend consumers are deleted. The visual prototype must not become a parallel mock data path.

This supersedes ADR-0026's parallel rewrite and production-Legacy policy. Without a runtime fallback, complete route and behavior parity is a release requirement for the Folio frontend.
