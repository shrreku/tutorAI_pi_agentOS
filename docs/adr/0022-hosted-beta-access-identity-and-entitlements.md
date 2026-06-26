# ADR-0022: Hosted Beta Access, Identity, And Entitlements

Status: Accepted

Date: 2026-06-17

## Context

StudyAgent is moving from local/dev use toward a hosted product validation beta. The hosted version needs public marketing/demo surfaces, authenticated learner access, gated upload/ingestion privileges, credits, feedback-based top-ups, and operator controls without turning every authenticated learner into an unrestricted source-ingestion user.

Production auth is not currently implemented in the API; the existing code only supports local/dev actor resolution. Notebook ownership is already the product boundary, so hosted access should preserve learner-owned workspaces while adding real identity and product entitlements.

## Decision

Use WorkOS AuthKit for hosted identity, login, user sessions, and email-backed accounts. StudyAgent owns Product Entitlements, Access Codes, Study Access, Ingestion Access, Tutor Credits, Ingestion Credits, Trial Tutor Budgets, Feedback Grants, and Admin Console controls in its own database.

Anonymous users get Public Preview Access only: landing pages, demos, and product information. Logged-in users get limited Study Access to Published Study Templates and may create Personal Learner Workspaces from those templates. Ingestion Access is gated by admin grant or typed Access Codes. Learner uploads are Private Learner Sources by default and never become Study Templates without a separate publishing workflow, Template Readiness, and Source Rights Review.

For the beta, public marketing/demo pages and the authenticated learner/admin app live in the same web application and deployment. Public routes provide the Working Brand surface, while protected routes require hosted identity and StudyAgent Product Entitlements.

The hosted beta route surface includes public routes for landing, demo, contact, privacy, terms, login, and auth callback; protected learner routes for the app dashboard, Beta Consent, template detail, workspace creation, learner workspaces, credits, access-code redemption, support, and account/data deletion; and protected admin routes for overview, users, workspaces, templates, access codes, credits, feedback, ingestion, and first-party analytics.

Launch should include at least three and at most eight Published Study Templates. More templates may exist as admin drafts, but only templates that pass Template Readiness and Source Rights Review are learner-visible.

Access Codes are typed grant bundles. Single-Use Access Codes are the default for risky grants such as Ingestion Access or credits. Campaign Access Codes may be used for bounded pilots, classes, or cohorts only with explicit redemption limits and expiry.

The launch Admin Console must support learner/workspace review, Ingestion Access grant/revoke, Access Code create/revoke, Tutor Credit and Ingestion Credit top-ups, Learning Feedback review, activation visibility, credit exhaustion visibility, and user/workspace disablement.

## Consequences

- Identity lock-in is isolated to WorkOS, while product access rules remain portable StudyAgent state.
- Every real study action is tied to an authenticated learner, but upload and ingestion remain privileged.
- The existing notebook ownership model stays aligned with Personal Learner Workspaces.
- Future paid plans, pilots, cohorts, or school/org access can build on Product Entitlements rather than overloading auth provider roles.
- Production auth implementation must replace `DISABLE_AUTH` local/dev actor resolution before hosted app access is enabled.

## References

- `docs/contexts/product-domain/CONTEXT.md`
- `docs/contexts/api-runtime/CONTEXT.md`
- `apps/api/src/auth.ts`
- WorkOS AuthKit
