import type { LearningArtifactAction, LearningArtifactSection, LearningArtifactView, NodeRef } from "@studyagent/schemas";
import { parseNotePersonalization, sectionTitleForKind } from "@studyagent/schemas";
import { decideArtifactQuality, qualityToLearningArtifactView } from "./artifact-lifecycle.js";

type RawArtifact = {
  id: string;
  notebookId: string;
  artifactType: string;
  title: string;
  status: string;
  payloadJson: Record<string, unknown>;
  sourceNodeRefsJson?: unknown[] | null;
  sourceClaimIds?: string[] | null;
  sourceChunkIds?: string[] | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type WikiLike = {
  id: string;
  notebookId: string;
  pageType: string;
  title: string;
  status: string;
  markdown: string;
  sourceClaimIds?: string[] | null;
  sourceChunkIds?: string[] | null;
  confidenceSummaryJson?: Record<string, unknown> | null;
  qualityScore?: number | null;
  updatedAt?: Date;
};

export function buildLearningArtifactView(artifact: RawArtifact): LearningArtifactView {
  const payload = isRecord(artifact.payloadJson) ? artifact.payloadJson : {};
  const sourceRefs = normalizeNodeRefs(artifact.sourceNodeRefsJson);
  const claimRefs: NodeRef[] = (artifact.sourceClaimIds ?? []).map((refId) => ({ refType: "claim", refId }));
  const chunkRefs: NodeRef[] = (artifact.sourceChunkIds ?? []).map((refId) => ({ refType: "chunk", refId }));
  const objectiveRefs: NodeRef[] = idsFrom(payload.objectiveIds ?? payload.plannedObjectiveIds).map((refId) => ({
    refType: "objective",
    refId,
  }));
  const coverageRefs: NodeRef[] = idsFrom(payload.coverageItemIds ?? payload.coverageRefs).map((refId) => ({
    refType: "coverage_item",
    refId,
  }));
  const allSourceRefs = uniqueRefs([...sourceRefs, ...claimRefs, ...chunkRefs]);
  const sections = sectionsForArtifact(artifact.artifactType, artifact.title, payload, allSourceRefs);
  const quality = qualityToLearningArtifactView(
    decideArtifactQuality({
      artifactType: artifact.artifactType,
      status: artifact.status,
      payload,
      sourceRefs: allSourceRefs,
    }),
  );

  return {
    id: artifact.id,
    notebookId: artifact.notebookId,
    title: artifact.title,
    type: artifact.artifactType,
    purpose: purposeForArtifact(artifact.artifactType),
    studentAction: studentActionForArtifact(artifact.artifactType),
    status: artifact.status,
    sourceRefs: allSourceRefs,
    claimRefs,
    coverageRefs,
    objectiveRefs,
    confidence: numberOrNull(payload.confidence ?? payload.qualityScore),
    lastUpdatedReason: stringOrNull(payload.lastUpdatedReason ?? payload.updatedReason ?? payload.approvalNote),
    sections,
    actions: actionsForArtifact(artifact.artifactType, artifact.status, allSourceRefs),
    quality,
    ...(artifact.createdAt ? { createdAt: artifact.createdAt.toISOString() } : {}),
    ...(artifact.updatedAt ? { updatedAt: artifact.updatedAt.toISOString() } : {}),
  };
}

export function buildWikiArtifactView(page: WikiLike): LearningArtifactView {
  const claimRefs: NodeRef[] = (page.sourceClaimIds ?? []).map((refId) => ({ refType: "claim", refId }));
  const chunkRefs: NodeRef[] = (page.sourceChunkIds ?? []).map((refId) => ({ refType: "chunk", refId }));
  const sourceRefs = uniqueRefs([...claimRefs, ...chunkRefs]);
  const confidence = numberOrNull(page.qualityScore ?? page.confidenceSummaryJson?.qualityScore);
  const sections: LearningArtifactSection[] = [
    {
      id: "wiki",
      title: page.pageType === "source_summary" ? "Source overview" : "Reference page",
      kind: "markdown",
      content: page.markdown.trim() || "This wiki page has not been generated yet.",
      sourceRefs,
      ...(page.markdown.trim() ? {} : { emptyMessage: "No wiki content has been generated yet." }),
    },
    evidenceSection(sourceRefs),
  ];
  const quality = qualityToLearningArtifactView(
    decideArtifactQuality({
      artifactType: "wiki_page",
      status: page.status,
      payload: { markdown: page.markdown },
      sourceRefs,
    }),
  );

  return {
    id: page.id,
    notebookId: page.notebookId,
    title: page.title,
    type: "wiki_page",
    purpose: "Durable source-backed reference for a concept or source.",
    studentAction: "Use this as the reference page while studying or asking the tutor for deeper explanation.",
    status: page.status,
    sourceRefs,
    claimRefs,
    coverageRefs: [],
    objectiveRefs: [],
    confidence,
    lastUpdatedReason: null,
    sections,
    actions: [
      { id: "study", label: "Study page", intent: "primary" },
      { id: "ask_tutor", label: "Ask tutor", intent: "secondary" },
      { id: "open_source", label: "Open evidence", intent: "secondary" },
    ],
    quality,
    ...(page.updatedAt ? { updatedAt: page.updatedAt.toISOString() } : {}),
  };
}

function sectionsForArtifact(
  artifactType: string,
  title: string,
  payload: Record<string, unknown>,
  sourceRefs: NodeRef[],
): LearningArtifactSection[] {
  const sections: LearningArtifactSection[] = [];
  const markdown = stringOrNull(payload.markdown ?? payload.noteMarkdown ?? payload.body);
  const regeneratedMarkdown = stringOrNull(payload.regeneratedMarkdown);
  const summary = stringOrNull(payload.summary ?? payload.takeaway ?? payload.finalTakeaway ?? payload.description);

  if (regeneratedMarkdown) {
    pushMarkdown(sections, "regenerated", "Regenerated study page", regeneratedMarkdown, sourceRefs);
  }

  if (artifactType === "note") {
    pushMarkdown(sections, "summary", "Study note", markdown ?? summary, sourceRefs, "Regenerate this note with a short overview, key ideas, source-backed examples, common mistakes, and a review checklist.");
    pushList(sections, "key_points", "Key points", payload.keyPoints ?? payload.points, "key_points", sourceRefs);
    pushList(sections, "examples", "Examples", payload.examples, "steps", sourceRefs);
    pushList(sections, "formulae", "Definitions and formulas", payload.formulas ?? payload.definitions, "formulae", sourceRefs);
    const personalization = parseNotePersonalization(payload.personalization);
    for (const section of personalization?.sections ?? []) {
      const sectionRefs = uniqueRefs([...sourceRefs, ...section.sourceRefs]);
      pushMarkdown(
        sections,
        `personalized_${section.id}`,
        section.title || sectionTitleForKind(section.kind),
        section.body,
        sectionRefs,
      );
    }
  } else if (artifactType === "worked_example") {
    pushMarkdown(sections, "problem", "Problem", stringOrNull(payload.problemStatement ?? payload.problem) ?? title, sourceRefs, "Regenerate this worked example with a source-grounded problem statement.");
    pushList(sections, "setup", "Setup", payload.setup ?? payload.given, "metadata", sourceRefs);
    pushList(sections, "steps", "Reasoning steps", payload.solutionSteps ?? payload.steps, "steps", sourceRefs);
    pushMarkdown(sections, "answer", "Final answer", stringOrNull(payload.finalAnswer ?? payload.finalTakeaway ?? payload.takeaway), sourceRefs, "Regenerate this example with a final answer and a reusable takeaway.");
    pushList(sections, "mistakes", "Common mistakes", payload.commonMistakes, "steps", sourceRefs);
    pushMarkdown(sections, "try_next", "Try next", stringOrNull(payload.tryNext ?? payload.nextPrompt), sourceRefs, "Add one nearby practice problem after regenerating.");
  } else if (artifactType === "formula_sheet") {
    pushList(sections, "formulas", "Formula table", payload.formulas, "formulae", sourceRefs);
    pushList(sections, "symbols", "Symbols and assumptions", payload.symbols ?? payload.assumptions, "table", sourceRefs);
    pushList(sections, "examples", "Example usage", payload.exampleUsage ?? payload.examples, "steps", sourceRefs);
    if (sections.length === 0) pushMarkdown(sections, "format", "Formula sheet format", "Regenerate with columns for expression, meaning, assumptions, units, when to use it, and one example.", sourceRefs);
  } else if (artifactType === "comparison_page") {
    pushMarkdown(sections, "setup", "What is being compared", [payload.leftTitle, payload.rightTitle].filter(Boolean).join(" vs "), sourceRefs);
    pushList(sections, "comparison", "Side-by-side comparison", payload.comparisonRows ?? payload.rows ?? payload.items, "comparison", sourceRefs);
    pushMarkdown(sections, "decision", "When to use each", [payload.whenToUseLeft, payload.whenToUseRight].filter(Boolean).join("\n\n"), sourceRefs);
    pushMarkdown(sections, "confusion", "Common confusion", stringOrNull(payload.commonConfusion), sourceRefs);
    if (sections.length === 0) pushMarkdown(sections, "format", "Comparison format", "Regenerate with two concepts, comparison dimensions, when to use each, common confusion, and a checkpoint question.", sourceRefs);
  } else if (artifactType === "quiz") {
    pushMarkdown(sections, "overview", "Practice goal", stringOrNull(payload.prompt ?? payload.summary), sourceRefs, "Regenerate with a focused practice goal and source-backed answer key.");
    pushList(sections, "questions", "Questions", payload.questions, "questions", sourceRefs);
    if (!Array.isArray(payload.questions) || payload.questions.length === 0) pushMarkdown(sections, "question_format", "Question format", "Include recall, application, and misconception checks. Each question should have a reference answer and explanation.", sourceRefs);
  } else if (artifactType === "flashcards") {
    pushMarkdown(sections, "overview", "Review goal", stringOrNull(payload.prompt ?? payload.summary), sourceRefs, "Regenerate with cards that test one idea at a time.");
    pushList(sections, "cards", "Cards", payload.cards, "flashcards", sourceRefs);
    if (!Array.isArray(payload.cards) || payload.cards.length === 0) pushMarkdown(sections, "card_format", "Card format", "Use concise fronts, precise backs, ambiguity warnings when needed, and concept links.", sourceRefs);
  } else if (artifactType === "revision_plan") {
    pushMarkdown(sections, "goal", "Revision goal", stringOrNull(payload.goal ?? payload.summary), sourceRefs);
    pushList(sections, "tasks", "Review tasks", payload.tasks ?? payload.steps, "steps", sourceRefs);
    pushList(sections, "schedule", "Suggested order", payload.schedule, "timeline", sourceRefs);
  } else if (artifactType === "session_plan" || artifactType === "teaching_arc") {
    pushMarkdown(sections, "goal", artifactType === "teaching_arc" ? "Lesson structure" : "Session goal", stringOrNull(payload.sessionGoal ?? payload.goal ?? payload.summary), sourceRefs);
    pushList(sections, "sequence", "Teaching sequence", payload.sequence ?? payload.steps ?? payload.objectives, "steps", sourceRefs);
    pushList(sections, "checks", "Checks for understanding", payload.checks ?? payload.diagnosticQuestions ?? payload.exitCriteria, "questions", sourceRefs);
  } else if (artifactType === "session_digest") {
    pushMarkdown(sections, "summary", "What changed", summary, sourceRefs);
    pushList(sections, "coverage", "Coverage updates", payload.coverageUpdates, "metadata", sourceRefs);
    pushList(sections, "next", "Next recommendation", payload.nextActions ?? payload.actionItems, "steps", sourceRefs);
    pushList(sections, "artifacts", "Generated artifacts", payload.artifactRefs ?? payload.generatedArtifacts, "metadata", sourceRefs);
  } else if (artifactType === "concept_card") {
    pushMarkdown(sections, "definition", "Definition", stringOrNull(payload.definition ?? payload.summary), sourceRefs, "Regenerate this concept card with a precise source-backed definition.");
    pushMarkdown(sections, "use", "When to use it", stringOrNull(payload.whenToUse ?? payload.useCase), sourceRefs, "Add when the student should apply this concept.");
    pushList(sections, "examples", "Examples", payload.examples, "steps", sourceRefs);
    pushMarkdown(sections, "confusion", "Common confusion", stringOrNull(payload.commonConfusion), sourceRefs, "Add a common confusion and how to avoid it.");
  } else if (artifactType === "diagram") {
    pushMarkdown(sections, "caption", "Diagram", stringOrNull(payload.caption ?? payload.summary ?? payload.description), sourceRefs);
    pushList(sections, "elements", "Elements", payload.nodes ?? payload.elements, "metadata", sourceRefs);
  }

  if (sections.length === 0) {
    pushMarkdown(sections, "reference", title, markdown ?? summary ?? readableFallback(payload), sourceRefs, "No readable content is available yet.");
  }
  sections.push(evidenceSection(sourceRefs));
  return sections;
}

function pushMarkdown(
  sections: LearningArtifactSection[],
  id: string,
  title: string,
  value: unknown,
  sourceRefs: NodeRef[],
  emptyMessage?: string,
): void {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text && !emptyMessage) return;
  sections.push({ id, title, kind: text ? "markdown" : "empty", content: text, sourceRefs, ...(emptyMessage && !text ? { emptyMessage } : {}) });
}

function pushList(
  sections: LearningArtifactSection[],
  id: string,
  title: string,
  value: unknown,
  kind: LearningArtifactSection["kind"],
  sourceRefs: NodeRef[],
): void {
  if (Array.isArray(value) && value.length > 0) {
    sections.push({ id, title, kind, content: value, sourceRefs });
  } else if (isRecord(value) && Object.keys(value).length > 0) {
    sections.push({ id, title, kind, content: value, sourceRefs });
  }
}

function evidenceSection(sourceRefs: NodeRef[]): LearningArtifactSection {
  return {
    id: "evidence",
    title: "Evidence",
    kind: sourceRefs.length ? "metadata" : "empty",
    content: sourceRefs,
    sourceRefs,
    ...(sourceRefs.length ? {} : { emptyMessage: "Needs source support." }),
  };
}

function purposeForArtifact(type: string): string {
  const map: Record<string, string> = {
    note: "A readable study note that preserves useful tutor output.",
    quiz: "A mastery check for the current notebook material.",
    flashcards: "Spaced active-recall practice for concepts that need reinforcement.",
    worked_example: "A solved example that shows reasoning, not just the answer.",
    formula_sheet: "A compact reference for formulas, symbols, assumptions, and usage.",
    comparison_page: "A side-by-side clarification for concepts that are easy to confuse.",
    revision_plan: "A prioritized review route for weak concepts and gaps.",
    session_plan: "Internal route for the current tutoring session.",
    teaching_arc: "Internal lesson structure used by the tutor.",
    session_digest: "A post-session record of progress, gaps, and next steps.",
    concept_card: "A compact source-backed concept reference.",
    diagram: "A visual or structural explanation of relationships.",
  };
  return map[type] ?? "A generated learning object for this notebook.";
}

function studentActionForArtifact(type: string): string {
  const map: Record<string, string> = {
    quiz: "Answer the questions, then record whether each one is understood or needs review.",
    flashcards: "Reveal each answer and rate recall so review scheduling can update.",
    revision_plan: "Work through the tasks in order and ask the tutor about blockers.",
    session_plan: "Use the Live Plan and session surface for learner-facing planning.",
    teaching_arc: "Use as a concise debug view of lesson structure.",
    session_digest: "Review what changed and continue with the next recommendation.",
  };
  return map[type] ?? "Study the artifact, inspect its evidence, and ask the tutor for help when needed.";
}

function actionsForArtifact(type: string, status: string, sourceRefs: NodeRef[]): LearningArtifactAction[] {
  const actions: LearningArtifactAction[] = [{ id: type === "quiz" || type === "flashcards" ? "practice" : "study", label: type === "quiz" || type === "flashcards" ? "Practice" : "Study", intent: "primary" }];
  actions.push({ id: "ask_tutor", label: "Ask tutor", intent: "secondary" });
  if (sourceRefs.length > 0) actions.push({ id: "open_source", label: "Open evidence", intent: "secondary" });
  if (status === "draft" || status === "proposed") actions.push({ id: "approve", label: "Approve", intent: "secondary" });
  if (type === "note") actions.push({ id: "edit", label: "Edit note", intent: "secondary" });
  return actions;
}

function normalizeNodeRefs(value: unknown): NodeRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (isRecord(item) && typeof item.refType === "string" && typeof item.refId === "string" ? { refType: item.refType, refId: item.refId } : null))
    .filter((item): item is NodeRef => Boolean(item));
}

function uniqueRefs(refs: NodeRef[]): NodeRef[] {
  const seen = new Set<string>();
  const out: NodeRef[] = [];
  for (const ref of refs) {
    const key = `${ref.refType}:${ref.refId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

function idsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : isRecord(item) && typeof item.refId === "string" ? item.refId : null))
    .filter((item): item is string => Boolean(item));
}

function readableFallback(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload).filter((key) => !["raw", "debug", "metadata"].includes(key)).slice(0, 8);
  return keys.length ? `Structured fields available: ${keys.join(", ")}.` : "No readable content is available yet.";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
