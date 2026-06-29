## Problem Statement

StudyAgent’s learner-facing workspace is still too close to its internal graph and pipeline model. Curriculum and module surfaces can become planning-heavy instead of readable study pages, objective structure is currently too fragmented for the learner experience, session surfaces do not yet consistently combine continuation and review in one place, source nodes do not always open the original document as the primary surface, Source Wiki generation can become noisy or over-eager, and quiz artifact creation can fail when a single chat turn runs out of tool calls. The result is a workspace that feels less like a durable learning environment and more like a mix of debug views, partial study aids, and failed artifact attempts.

## Solution

Make the learner workspace behave like a set of readable reference surfaces with durable study artifacts behind it. Curriculum and module views should read like wiki pages, objectives should stay as internal planning structure rather than separate learner pages, session nodes should reopen the active chat session and show an insights section, source nodes should open the original source document when possible, Source Wiki pages should be generated in bounded batches around the most important concepts, and quiz artifact creation should become resumable so partial progress survives tool-call limits instead of failing the whole action.

## User Stories

1. As a learner, I want curriculum pages to read like study notes, so that I can understand the path without seeing internal planning noise.
2. As a learner, I want module pages to be readable wiki-style pages, so that each chapter-sized topic is something I can actually study from.
3. As a learner, I want the module page to show an objective list, so that I can see the task breakdown without jumping through extra pages.
4. As a learner, I want objective nodes not to appear as standalone learner pages, so that the workspace stays compact and easier to navigate.
5. As a learner, I want session nodes to reopen the existing chat session in the tutor panel, so that I can continue the conversation where I left off.
6. As a learner, I want session nodes to show an insights section, so that I can review what was taught, what I was confused about, and what comes next.
7. As a learner, I want source nodes to open the original source document, so that I can inspect the PDF, DOCX, or Markdown directly when I need to.
8. As a learner, I want Source Wiki pages to read like polished notes rather than raw claim output, so that I can use them as a study surface.
9. As a learner, I want the system to generate Source Wiki pages in bounded batches of the most important concepts, so that the wiki improves in useful chunks instead of all at once.
10. As a learner, I want noisy or low-value extracted concepts to stay secondary, so that the wiki remains focused on the main ideas that matter for the notebook.
11. As a learner, I want quiz creation to preserve partial progress when artifact generation runs out of tool calls, so that I do not lose work already completed.
12. As a learner, I want quiz creation to resume from a saved draft or job state, so that I can finish the artifact without starting over.
13. As a learner, I want study artifacts to remain separate from reference surfaces, so that generated aids and readable pages do not blur together.
14. As a maintainer, I want the learner workspace to use one consistent vocabulary for curriculum, module, session, source, wiki, and artifacts, so that the product feels coherent.
15. As a maintainer, I want internal planning structures like objective lists to stay internal, so that learner-facing pages do not expose implementation detail.
16. As a maintainer, I want quiz artifact creation to degrade into a resumable state instead of a hard failure, so that the tutor can recover from tool-budget limits.
17. As a tutor, I want session insights to be derived from durable session events and crystallization output, so that review content is consistent with what actually happened.
18. As a tutor, I want readable wiki pages to be the default Source Wiki output, so that I can teach from them without re-reading the full source.

## Implementation Decisions

- Reference Surface should be the canonical learner-facing rendering path for curriculum, module, source, session, Source Wiki, and artifact references.
- Workspace Read Model should expose the open targets and learner-visible node semantics needed for Study Map and Source Wiki without rebuilding visibility rules in the web app.
- Curriculum and module surfaces should be wiki-style readable pages, with objectives shown as an embedded task list rather than as standalone learner pages.
- Objective List should remain an internal planning structure. It may exist as a node or artifact in the model, but there should be no individual learner-facing objective pages.
- Session reference surfaces should combine a chat-session reopen action with a readable insights section derived from tutor events, session crystallization, mistakes, doubts, and next actions.
- Source reference surfaces should prefer the original document as the primary open target, with rendered or extracted text used as fallback/reference content when direct opening is not possible.
- Source Wiki generation should favor bounded batches of roughly 5-6 high-value concepts/pages at a time, prioritized by curriculum importance and learner value.
- Concept extraction should be conservative by default. Main curriculum-relevant concepts should be promoted first, while noisy extras remain secondary or hidden unless they clearly add value.
- Source Wiki pages should remain reference surfaces, not artifacts, and they should be generated as readable study notes with evidence references rather than as raw claim lists.
- Quiz artifact creation should be able to persist a partial draft or queued job state when tool-call limits are hit, and the learner should be able to resume from that state rather than retry from scratch.
- Artifact lifecycle and tutor-turn behavior should treat interrupted quiz generation as recoverable work, not as a terminal failure.
- The existing consent and quality-gate model for learner-visible artifacts should remain in place, but it should support resumable artifact construction.
- The system should keep low-signal debug or graph detail available to developers or Dev Mode, but it should not surface those details as the default learner experience.

## Testing Decisions

- Good tests should verify external behavior only: what the learner can see, which node opens which surface, what state is returned after an action, and whether partial artifact creation can resume.
- The most important modules to test are Reference Surface, Workspace Read Model, Source Wiki generation/compilation, Artifact Lifecycle, Tutor Turn, and the web workspace viewer shells.
- Reference Surface tests should cover curriculum, module, source, session, and wiki surfaces, including the session reopen action, insights rendering, and the source-document open behavior for PDF, DOCX, and Markdown.
- Workspace Read Model tests should cover learner-visible node semantics, hidden vs visible surfaces, and the absence of standalone objective pages for learners.
- Source Wiki tests should cover readable page generation, bounded high-value batches, conservative concept selection, and the distinction between main concepts and noisy extras.
- Tutor Turn and Artifact Lifecycle tests should cover quiz artifact creation that stops in a resumable state when the tool-call budget is exceeded, and then resumes from the saved draft or job state.
- Existing test patterns in this repo already show the right shape for these checks: reference-surface tests, FullPanelViewer tests, whiteboard/read-model tests, wiki-core compilation tests, tutor-turn tests, and artifact-lifecycle tests.

## Out of Scope

- Reworking the entire tutor experience into a new chat paradigm.
- Exposing raw claims, chunks, coverage records, or planning internals as learner-facing pages.
- Creating separate learner pages for individual objective nodes.
- Removing the existing artifact consent and quality-gate model.
- Turning every extracted concept into a first-class learner page.
- Replacing the notebook model, auth model, or event stream architecture.
- Introducing an exam-specific mock-exam lifecycle.

## Further Notes

This PRD intentionally separates readable reference surfaces from generated study artifacts. It also intentionally favors a smaller number of high-value wiki pages over an open-ended polish queue, because the learner value comes from readable, curriculum-relevant pages rather than exhaustive concept extraction.
