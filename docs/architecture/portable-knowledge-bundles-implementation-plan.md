# Portable Knowledge Bundles Implementation Plan

Status: design in progress through grilling.

This plan adds OKF-style portability to StudyAgent without replacing the current durable LLM Wiki. Postgres remains the canonical product store. Portable bundles are import/export artifacts for source-derived knowledge, not the runtime source of truth.

The product goal is to let StudyAgent knowledge travel between notebooks, study templates, eval fixtures, and external tools as readable markdown/frontmatter bundles while preserving source grounding, Evidence, claims, relations, and learner-safe pages.

## Source Documents

- `docs/contexts/product-domain/CONTEXT.md`
- `docs/contexts/knowledge-graph/CONTEXT.md`
- `docs/contexts/web-workspace/CONTEXT.md`
- ADR-0002: Durable LLM Wiki Between Sources And Tutoring.
- ADR-0006: Postgres System Of Record, Neo4j Derived Projection.
- ADR-0010: Workspace, Reference Surfaces, And Evidence Vocabulary.
- ADR-0021: Rolling Wiki And Curriculum Generation Lifecycle.
- ADR-0025: Portable Knowledge Bundles As A StudyAgent OKF Profile.
- Google Open Knowledge Format article and OKF v0.1 specification.

## Accepted Decisions

Portable bundles represent source knowledge only. They exclude learner-specific mastery, tutor sessions, Live Plan state, private artifacts, credits, personal annotations, and runtime-only analytics.

Portable identity is path-stable and human-readable. StudyAgent database IDs may be included as optional round-trip metadata, but file paths and portable IDs are the bundle identity.

StudyAgent uses a StudyAgent OKF Profile instead of strict vanilla OKF. The profile keeps markdown/frontmatter/link portability and adds source-grounded learning metadata for Evidence, claims, readiness, source links, concept links, and round-trip identity.

Claims are first-class bundle documents. Learner-facing pages may embed selected claim text, but claim documents remain the auditable knowledge atoms for Evidence tracing, contradiction, supersession, and import review.

Bundles include bounded Evidence excerpts and citation records. Full original source files are optional assets only when rights allow redistribution.

Bundle imports go through Portable Knowledge Import Review. The importer resolves portable identities to notebook knowledge, produces proposed creates/updates/supersessions/contradictions, runs validation, and commits through the existing wiki change-set path rather than writing directly to canonical tables.

Source-Scoped Knowledge Bundles ship first. Notebook-Scoped Knowledge Bundles come later once source-scoped export/import is reliable.

The canonical bundle form is a plain directory. API/download transport may package that directory as a zip archive; tarball support is out of scope for the MVP.

Admin UI is part of the MVP. CLI/dev tooling may still exist for fixtures and CI, but an admin must be able to upload a bundle, inspect the import review, see conflicts/warnings/Evidence/rights issues, and accept or reject the import from the Admin Console.

Full original source assets are excluded by default. They may be included only through an explicit admin `include_original_assets` action after Source Rights Review. Bounded Evidence excerpts and source metadata remain the default portable grounding layer.

Curriculum travels only when it is reusable source/template knowledge, such as a Published Study Template module outline or objective path. Learner-adaptive Live Plan, current objective, completed objectives, weak concepts, mastery-derived recommendations, and session-specific planning never travel in a Portable Source Knowledge Bundle.

MVP export/import access is admin/dev-only. Learner-facing export of private uploaded-source bundles is deferred until privacy, rights, abuse, and data-portability policy are designed.

## Current System Fit

The current code already has most canonical knowledge objects:

- `sources` and `source_versions` hold uploaded source metadata, content hash, parser metadata, and normalized document tree.
- `chunks` hold retrievable source spans and citation coordinates.
- `concepts` hold notebook-scoped canonical concept names and aliases.
- `claims` and `claim_concept_links` hold source-backed assertions and concept attachment.
- `wiki_pages` hold generated or human-augmented markdown pages with source claim/chunk refs and readiness metadata.
- `graph_relations` holds canonical knowledge edges.
- `WikiChangeSet` already groups concepts, claims, graph relations, wiki pages, warnings, and events before persistence.

The missing layer is a stable bundle contract plus import/export adapters.

## Bundle Profile

Use a bundle-level manifest:

```text
manifest.yaml
index.md
log.md
sources/
topics/
concepts/
claims/
evidence/
relations/
assets/
```

The profile should support these frontmatter fields where relevant:

```yaml
type: Concept
profile: studyagent-okf
profile_version: 0.1
title: Entropy
portable_id: concepts/entropy
studyagent:
  concept_id: cnc_...
  page_id: wp_...
source_refs:
  - sources/thermodynamics-chapter-01
evidence_refs:
  - evidence/thermodynamics-chapter-01/p003-entropy-definition
claim_refs:
  - claims/entropy-increases-in-isolated-systems
page_readiness: still_improving
generation_mode: heuristic
```

Use markdown body content as the readable surface. Use frontmatter for identity, links, Evidence, source grounding, and round-trip metadata. Avoid embedding opaque StudyAgent IDs in visible markdown text.

## Phase 1: Source-Scoped Bundles

Source-scoped bundles export one Source and the source-derived knowledge needed to reuse it.

Included:

- source metadata and source summary;
- source version metadata: content hash, parser name/version, parse confidence, source level when known;
- selected document outline or heading path map;
- Topic Pages and Concept Pages derived from the source;
- first-class Claim documents tied to source spans and Concepts;
- bounded Evidence documents with excerpt, page/character coordinates, source title, and rights/visibility metadata;
- graph relation documents or manifest entries for concept-concept, page-concept, claim-concept, claim-source, and contradiction/supersession links;
- Page Readiness and generation mode metadata;
- optional original file asset only when an admin explicitly includes it after Source Rights Review.

Excluded:

- learner mastery and weak concept state;
- tutor sessions, turns, transcripts, and Live Plan;
- generated study artifacts unless they are source-template-owned and explicitly promoted by a separate policy;
- private annotations;
- credits, entitlements, analytics, and operational telemetry.

### Source Export Flow

1. Load one `source` and latest successful `source_version`.
2. Load source chunks, source-linked claims, claim concept links, wiki pages, graph relations, and relevant concepts.
3. Convert DB IDs into path-stable portable identities.
4. Emit manifest, source page, topic/concept pages, claims, Evidence docs, and relation records.
5. Validate links, required frontmatter, citation reachability, rights flags, and learner-safe markdown.
6. Package as a plain directory or zip archive.

### Source Import Flow

1. Parse manifest and all markdown/frontmatter files.
2. Validate StudyAgent OKF Profile version and required fields.
3. Resolve portable identities against existing notebook concepts/pages/claims using path identity, title, aliases, source hash, and optional round-trip IDs.
4. Build an import preview with creates, updates, conflicts, contradictions, supersessions, warnings, and rights constraints.
5. Present the import preview in the Admin Console before any canonical writes.
6. Convert accepted changes into a `WikiChangeSet`-compatible structure.
7. Apply through the existing knowledge commit path and emit notebook events.
8. Rebuild or refresh derived projection/read-model state after commit.

### Admin Review UX

Extend the existing protected Admin Console with a Knowledge Bundles section.

Admin routes should fit the current `/admin/...` API and web navigation shape:

- `POST /admin/knowledge-bundles/import-preview`: upload or reference a bundle and return a review object.
- `GET /admin/knowledge-bundles/import-reviews`: list recent/pending reviews.
- `GET /admin/knowledge-bundles/import-reviews/:id`: inspect one review.
- `POST /admin/knowledge-bundles/import-reviews/:id/accept`: commit accepted changes through the knowledge commit path.
- `POST /admin/knowledge-bundles/import-reviews/:id/reject`: close a review without canonical writes.

The admin screen should show:

- bundle manifest, profile version, source/notebook scope, and rights summary;
- target notebook/workspace;
- creates, updates, unchanged items, conflicts, contradictions, and supersessions;
- Evidence coverage and missing-Evidence failures;
- learner-state exclusion checks;
- source asset inclusion warnings;
- validation errors that block acceptance;
- dry-run counts for concepts, claims, pages, Evidence, relations, and events;
- links to affected Source Wiki pages or source records after commit.

The MVP can keep conflict resolution coarse: accept all safe changes or reject the review. Fine-grained per-claim/per-page selection can come after the first import path is reliable.

### Source MVP Modules

Recommended first implementation modules:

- `packages/wiki-core/src/portable-knowledge-profile.ts`
- `packages/wiki-core/src/portable-knowledge-export.ts`
- `packages/wiki-core/src/portable-knowledge-import.ts`
- `packages/wiki-core/src/portable-knowledge-lint.ts`
- `apps/api/src/routes/portable-knowledge.ts`
- `apps/web/src/pages/admin/AdminKnowledgeBundlesPage.tsx`
- focused tests in `packages/wiki-core` and route tests in `apps/api`.

The pure profile/export/import/lint logic should live in `wiki-core`. API routes should handle auth, notebook/source ownership, request/response envelopes, and storage/streaming. Admin UI should use the existing `AdminShell`, `AdminTable`, and `useAdminFetch` patterns.

## Phase 2: Notebook-Scoped Bundles

Notebook-scoped bundles export a curated multi-source knowledge set. They are for Study Templates, eval fixtures, classroom packs, or external knowledge packs where cross-source concepts and contradictions matter.

Included:

- bundle manifest with notebook-level title, description, source count, profile version, export time, and rights summary;
- multiple source-scoped sub-bundles or source folders;
- notebook-global Topic Pages and Concept Pages;
- cross-source claims, contradictions, supersessions, and concept merges;
- curriculum outline only when it is template-owned source knowledge, not learner-specific Live Plan state;
- template readiness metadata when used for Published Study Templates;
- eval fixture metadata when used for Synthetic Learner evals.

Excluded:

- personal learner state;
- tutor transcripts and session-specific outputs;
- learner-private artifacts;
- runtime layout positions unless explicitly exported as a non-canonical presentation hint.
- learner-adaptive Live Plan, current objective, completed objectives, weak concepts, mastery-derived recommendations, and session-specific planning.

### Notebook Export Flow

1. Select export scope: all sources, selected sources, or Published Study Template sources.
2. Export each source folder using the Phase 1 source-scoped exporter.
3. Add notebook-global pages and cross-source relations.
4. Include cross-source claim resolution metadata, including supersession and contradiction links.
5. Include optional curriculum/template metadata only when it is reusable source material.
6. Validate that no private learner state or restricted original source asset is included.

### Notebook Import Flow

1. Parse bundle manifest and source sub-bundles.
2. Run source-level validation first.
3. Resolve cross-source concept identity and aliases after source-level import previews are built.
4. Build one notebook-level import review with source-level and cross-source changes.
5. Commit accepted changes as one or more deterministic `WikiChangeSet` commits.
6. Trigger projection rebuild and Workspace read-model refresh.

## Format Rules

Use lowercase kebab-case paths:

```text
sources/thermodynamics-chapter-01.md
topics/second-law-of-thermodynamics.md
concepts/entropy.md
claims/entropy-increases-in-isolated-systems.md
evidence/thermodynamics-chapter-01/p003-entropy-definition.md
relations/concept-links.yaml
```

Frontmatter must be parseable without executing code. Markdown body must remain readable in generic markdown tools.

Portable IDs are path-derived and stable under round-trip export/import. If a title changes, preserve a `previous_portable_ids` list so imports can still match prior bundles.

Source-specific claims should reference Evidence documents. Pages may reference claims and Evidence. Relations may reference concepts, pages, claims, sources, and Evidence by portable ID.

StudyAgent IDs are optional metadata and never the primary identity.

## Validation Gates

Bundle lint should fail on:

- missing manifest or unsupported profile version;
- duplicate portable IDs;
- broken links between pages, claims, Evidence, sources, or relations;
- source-specific claim without Evidence;
- Evidence excerpt without source span or rights metadata;
- learner-state fields in a portable source knowledge bundle;
- learner-adaptive curriculum state in a portable bundle;
- DB ID used as primary portable identity;
- markdown that leaks raw internal IDs into learner-visible page body;
- contradiction/supersession link to a missing claim.
- original source asset included without explicit Source Rights Review metadata.

Import preview should warn on:

- title/alias collision with existing concepts;
- source hash mismatch for optional StudyAgent round-trip IDs;
- lower-confidence incoming claim superseding higher-confidence local claim;
- incoming Evidence excerpt with restricted rights;
- profile fields newer than the importer understands.

## Verification

Unit tests:

- profile schema parsing;
- path-stable ID generation;
- frontmatter round-trip;
- source-scoped export shape;
- import preview conflict detection;
- lint failures for broken Evidence/claim links.

Integration tests:

- export source from seeded notebook, import into empty notebook, verify concepts/claims/pages/Evidence survive;
- import the same source bundle twice and verify idempotent-ish results;
- import bundle with changed claim and verify review/supersession behavior;
- export notebook-scoped bundle with two sources and cross-source contradiction, import into new notebook, verify cross-source relation survives;
- verify no learner state exports from notebook with sessions, mastery, Live Plan, artifacts, and credits.

Runtime checks:

- Source Wiki still renders from Postgres after import.
- Search can retrieve imported pages/claims/chunks.
- Neo4j projection can rebuild from imported canonical rows.
- Reference Surface and Evidence drawer do not expose raw internal IDs in learner mode.

## Rollout Order

1. Define StudyAgent OKF Profile schemas and lint rules in `wiki-core`.
2. Implement source-scoped exporter against current Postgres-backed LLM Wiki.
3. Implement source-scoped importer as review-only preview.
4. Add admin-only import preview API routes and persisted review records.
5. Add Admin Console Knowledge Bundles page for upload, review, accept, reject, and admin-only export.
6. Convert accepted source import previews into `WikiChangeSet` commits.
7. Add Source Wiki and Reference Surface regression tests for imported bundles.
8. Add developer CLI helpers for fixture export/import once the admin path is covered.
9. Add notebook-scoped manifest and source-sub-bundle export.
10. Add cross-source import review and conflict resolution.
11. Use notebook-scoped bundles for Published Study Templates and Eval Source Fixtures only after source-scoped behavior is stable.

## Deferred Design Questions

- Learner-facing private-source export as a future data-portability feature.
- Fine-grained per-claim/per-page conflict resolution in import review.
- Published marketplace or public bundle sharing beyond admin-managed Study Templates.
