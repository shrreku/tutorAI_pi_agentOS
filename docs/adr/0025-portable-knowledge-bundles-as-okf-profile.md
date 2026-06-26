# ADR-0025: Portable Knowledge Bundles As A StudyAgent OKF Profile

Status: Accepted

Date: 2026-06-21

StudyAgent will add OKF-style Portable Source Knowledge Bundles as import/export artifacts, not as the canonical wiki store. Postgres remains the source of truth for sources, source versions, chunks, concepts, claims, wiki pages, graph relations, curriculum, events, and learner state; Neo4j remains a derived projection. Portable bundles use a StudyAgent OKF Profile: readable markdown/frontmatter/link files with path-stable portable identity, first-class claim and Evidence documents, optional round-trip StudyAgent IDs, and source-grounded readiness/rights metadata.

Source-Scoped Knowledge Bundles ship first, followed by Notebook-Scoped Knowledge Bundles for curated multi-source Study Templates and eval fixtures. Bundle imports must go through Portable Knowledge Import Review and commit accepted changes through the existing wiki change-set path instead of writing directly to canonical tables. Bundles exclude learner-specific mastery, sessions, Live Plan state, private artifacts, credits, personal annotations, and runtime analytics; original source assets are excluded by default unless an admin explicitly includes them after Source Rights Review.

This preserves StudyAgent's durable LLM Wiki, claim lifecycle, Evidence model, readiness gates, and governed write path while gaining OKF-style portability and external inspectability. Strict vanilla OKF was rejected because it does not encode enough StudyAgent semantics for source grounding, Evidence, readiness, contradiction, supersession, rights, and safe import review.
