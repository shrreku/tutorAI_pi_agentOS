import { and, desc, eq } from "drizzle-orm";
import { artifacts, quizAttempts } from "@studyagent/db";
import type {
  EvidenceRef,
  InteractiveLearningBlock,
  InteractiveLearningActionName,
  NodeRef,
  ReferenceSurface,
} from "@studyagent/schemas";
import { sanitizeLearnerEvidenceRefs } from "./node-open-target.js";
import { learnerVisibilityForArtifact } from "./artifact-lifecycle.js";
import type { AppContext } from "./context.js";
import { loadPersonalizationCanonicalState } from "./interactive-learning-personalization.js";
import { loadInteractiveBlockState } from "./interactive-learning-state.js";

type ArtifactInput = {
  id: string;
  notebookId: string;
  artifactType: string;
  title: string;
  status: string;
  payloadJson: Record<string, unknown>;
  sourceNodeRefsJson?: unknown[] | null;
  sourceClaimIds?: string[] | null;
  sourceChunkIds?: string[] | null;
};

type BuildInteractiveBlocksInput = {
  notebookId: string;
  surfaceType: ReferenceSurface["surfaceType"];
  nodeRef: NodeRef;
  title: string;
  artifact?: ArtifactInput | null;
  evidenceRefs?: EvidenceRef[];
  sourceRefs?: NodeRef[];
  userId?: string | undefined;
  /** When false, only artifact-backed blocks are emitted (used when LLM stored plans exist). */
  includeSurfaceDefaults?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function idsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function normalizeNodeRefs(value: unknown): NodeRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> =>
        isRecord(entry) && typeof entry.refType === "string" && typeof entry.refId === "string",
    )
    .map((entry) => ({
      refType: entry.refType as NodeRef["refType"],
      refId: entry.refId as string,
    }));
}

function artifactIsLearnerVisible(artifact: ArtifactInput): boolean {
  return (
    learnerVisibilityForArtifact({
      artifactType: artifact.artifactType,
      status: artifact.status,
    }) === "learner"
  );
}

function baseBlock(
  partial: Pick<InteractiveLearningBlock, "id" | "kind" | "title" | "learningPurpose"> &
    Partial<InteractiveLearningBlock>,
): InteractiveLearningBlock {
  return {
    surfaceRole: "primary",
    objectiveRefs: [],
    conceptRefs: [],
    sourceRefs: [],
    evidenceRefs: [],
    prompt: null,
    content: {},
    canonicalState: {},
    allowedActions: [],
    rendererPreference: "mcp_app",
    fallbackSummary: null,
    quality: { sourceBacked: false, needsReview: false },
    ...partial,
  };
}

async function loadQuizAttempts(
  ctx: AppContext,
  notebookId: string,
  artifactId: string,
  userId?: string,
): Promise<Array<{ questionId: string; isCorrect: boolean; createdAt: string }>> {
  if (!userId) return [];
  const rows = await ctx.db.db
    .select({
      questionId: quizAttempts.questionId,
      isCorrect: quizAttempts.isCorrect,
      createdAt: quizAttempts.createdAt,
    })
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.notebookId, notebookId),
        eq(quizAttempts.artifactId, artifactId),
        eq(quizAttempts.userId, userId),
      ),
    )
    .orderBy(desc(quizAttempts.createdAt))
    .limit(50);

  return rows.map((row) => ({
    questionId: row.questionId,
    isCorrect: row.isCorrect === 1,
    createdAt: row.createdAt.toISOString(),
  }));
}

function normalizeQuizQuestions(rawQuestions: unknown[]): Array<Record<string, unknown>> {
  return rawQuestions.map((entry, index) => {
    if (!isRecord(entry)) {
      return { id: `q_${index}`, prompt: String(entry) };
    }
    const id = typeof entry.id === "string" && entry.id.length > 0 ? entry.id : `q_${index}`;
    const prompt = stringValue(entry.prompt ?? entry.question ?? entry.title ?? entry.problem);
    const choices = stringArray(entry.choices ?? entry.options);
    const upgraded = maybeUpgradeGenericQuizQuestion(entry, prompt, choices, index);
    return {
      ...entry,
      id,
      ...(upgraded ?? {
        ...(prompt ? { prompt } : {}),
        ...(choices.length > 0 ? { choices } : {}),
      }),
    };
  });
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
}

function maybeUpgradeGenericQuizQuestion(
  entry: Record<string, unknown>,
  prompt: string | null,
  choices: string[],
  index: number,
): Record<string, unknown> | null {
  if (!prompt || choices.length > 0) return null;
  const match = prompt.match(/^how would you explain\s+(.+?)\s+in your own words\??$/i);
  if (!match) return null;
  const conceptName = match[1]?.trim() || "this concept";
  const reference =
    stringValue(entry.referenceAnswer ?? entry.answer ?? entry.explanation) ??
    `${conceptName} should be connected to source evidence and the current practice goal`;
  const upgradedPrompt =
    index % 2 === 0
      ? `Which statement best describes ${conceptName}?`
      : `What is the main role of ${conceptName} in this material?`;
  const answer = stripTrailingPeriod(reference);
  return {
    prompt: upgradedPrompt,
    choices: [
      answer,
      `It is only a vocabulary label and does not affect problem solving.`,
      `It means the same thing as every other concept in the quiz.`,
      `It should be memorized without connecting it to source evidence.`,
    ],
    answer,
    referenceAnswer: answer,
    explanation:
      stringValue(entry.explanation) ?? `${conceptName}: ${stripTrailingPeriod(reference)}`,
    difficulty: index % 2 === 0 ? "recall" : "application",
  };
}

function stripTrailingPeriod(value: string): string {
  return value.trim().replace(/[.。]\s*$/, "");
}

function buildQuizBlock(
  artifact: ArtifactInput,
  sourceRefs: NodeRef[],
  evidenceRefs: EvidenceRef[],
  attempts: Array<{ questionId: string; isCorrect: boolean; createdAt: string }>,
  nodeRef: NodeRef,
): InteractiveLearningBlock {
  const payload = artifact.payloadJson ?? {};
  const questions = normalizeQuizQuestions(
    Array.isArray(payload.questions) ? payload.questions : [],
  );
  const conceptIds = idsFrom(payload.conceptIds);
  const conceptRefs = conceptIds.map((refId) => ({ refType: "concept" as const, refId }));

  return baseBlock({
    id: `interactive_quiz_${artifact.id}`,
    kind: "quiz",
    title: artifact.title,
    learningPurpose: "Evaluable practice with immediate feedback.",
    nodeRef,
    artifactRef: { refType: "artifact", refId: artifact.id },
    conceptRefs,
    sourceRefs,
    evidenceRefs,
    prompt: typeof payload.prompt === "string" ? payload.prompt : null,
    content: { questions },
    canonicalState: {
      attempts,
      questionCount: questions.length,
      completedQuestionIds: [...new Set(attempts.map((attempt) => attempt.questionId))],
    },
    allowedActions:
      evidenceRefs.length > 0
        ? ["quiz.answer_submitted", "evidence.source_span_opened", "tutor.help_requested"]
        : ["quiz.answer_submitted", "tutor.help_requested"],
    fallbackSummary:
      questions.length > 0 ? `${questions.length} practice question(s).` : "Practice quiz.",
    quality: {
      sourceBacked: sourceRefs.length > 0,
      needsReview: questions.length === 0,
    },
  });
}

function buildFlashcardDeckBlock(
  artifact: ArtifactInput,
  sourceRefs: NodeRef[],
  evidenceRefs: EvidenceRef[],
  nodeRef: NodeRef,
): InteractiveLearningBlock {
  const payload = artifact.payloadJson ?? {};
  const cards = Array.isArray(payload.cards) ? payload.cards : [];
  const reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
  const conceptIds = idsFrom(payload.conceptIds);
  const conceptRefs = conceptIds.map((refId) => ({ refType: "concept" as const, refId }));

  return baseBlock({
    id: `interactive_flashcards_${artifact.id}`,
    kind: "flashcard_deck",
    title: artifact.title,
    learningPurpose: "Spaced review of key ideas.",
    nodeRef,
    artifactRef: { refType: "artifact", refId: artifact.id },
    conceptRefs,
    sourceRefs,
    evidenceRefs,
    prompt: typeof payload.prompt === "string" ? payload.prompt : null,
    content: { cards },
    canonicalState: {
      reviews,
      cardCount: cards.length,
      reviewedCardIds: reviews
        .map((review) =>
          isRecord(review) && typeof review.cardId === "string" ? review.cardId : null,
        )
        .filter((cardId): cardId is string => Boolean(cardId)),
    },
    allowedActions: ["flashcard.review_rated", "tutor.help_requested"],
    fallbackSummary: cards.length > 0 ? `${cards.length} flashcard(s).` : "Flashcard deck.",
    quality: {
      sourceBacked: sourceRefs.length > 0,
      needsReview: cards.length === 0,
    },
  });
}

function buildComparisonBlock(
  artifact: ArtifactInput,
  sourceRefs: NodeRef[],
  evidenceRefs: EvidenceRef[],
  nodeRef: NodeRef,
): InteractiveLearningBlock {
  const payload = artifact.payloadJson ?? {};
  const comparisonRows = Array.isArray(payload.comparisonRows)
    ? payload.comparisonRows
    : Array.isArray(payload.rows)
      ? payload.rows
      : [];

  return baseBlock({
    id: `interactive_comparison_${artifact.id}`,
    kind: "comparison",
    title: artifact.title,
    learningPurpose: "Compare related ideas side by side with source-backed context.",
    nodeRef,
    artifactRef: { refType: "artifact", refId: artifact.id },
    sourceRefs,
    evidenceRefs,
    content: {
      leftTitle: typeof payload.leftTitle === "string" ? payload.leftTitle : "Concept A",
      rightTitle: typeof payload.rightTitle === "string" ? payload.rightTitle : "Concept B",
      comparisonRows,
      checkpointQuestion:
        typeof payload.checkpointQuestion === "string" ? payload.checkpointQuestion : null,
    },
    canonicalState: {
      reviewedRowIds: [],
      checkpointAnswered: false,
    },
    allowedActions: ["evidence.source_span_opened", "surface.completed", "tutor.help_requested"],
    fallbackSummary:
      comparisonRows.length > 0
        ? `Compare ${comparisonRows.length} dimension(s) side by side.`
        : "Side-by-side concept comparison.",
    quality: {
      sourceBacked: sourceRefs.length > 0 || evidenceRefs.length > 0,
      needsReview: comparisonRows.length === 0,
    },
  });
}

function buildWorkedExampleBlock(
  artifact: ArtifactInput,
  sourceRefs: NodeRef[],
  evidenceRefs: EvidenceRef[],
  nodeRef: NodeRef,
): InteractiveLearningBlock {
  const payload = artifact.payloadJson ?? {};
  const rawSteps = payload.solutionSteps ?? payload.steps;
  const steps = Array.isArray(rawSteps) ? rawSteps : [];
  const stepAnswers = Array.isArray(payload.stepAnswers) ? payload.stepAnswers : [];

  return baseBlock({
    id: `interactive_worked_example_${artifact.id}`,
    kind: "worked_example",
    title: artifact.title,
    learningPurpose: "Step-by-step reasoning practice.",
    nodeRef,
    artifactRef: { refType: "artifact", refId: artifact.id },
    sourceRefs,
    evidenceRefs,
    prompt: typeof payload.problemStatement === "string" ? payload.problemStatement : null,
    content: {
      problemStatement: payload.problemStatement ?? payload.problem ?? artifact.title,
      steps,
      finalAnswer: payload.finalAnswer ?? payload.finalTakeaway ?? null,
    },
    canonicalState: {
      stepAnswers,
      completedStepIds: stepAnswers
        .map((entry) => (isRecord(entry) && typeof entry.stepId === "string" ? entry.stepId : null))
        .filter((stepId): stepId is string => Boolean(stepId)),
    },
    allowedActions: [
      "worked_example.step_answered",
      "worked_example.step_revealed",
      "tutor.help_requested",
    ],
    fallbackSummary: "Worked example with guided steps.",
    quality: {
      sourceBacked: sourceRefs.length > 0,
      needsReview: steps.length === 0,
    },
  });
}

function learnerEvidenceSpans(evidenceRefs: EvidenceRef[]): Array<Record<string, unknown>> {
  return evidenceRefs.map((ref) => ({
    id: ref.id,
    label: ref.label,
    excerpt: ref.text,
    sourceTitle: ref.sourceTitle ?? null,
    pageStart: ref.pageStart ?? null,
    pageEnd: ref.pageEnd ?? null,
    statementKind: ref.statementKind ?? null,
  }));
}

function buildEvidenceExplorerBlock(
  input: BuildInteractiveBlocksInput,
  evidenceRefs: EvidenceRef[],
  blockState: Record<string, unknown>,
): InteractiveLearningBlock | null {
  if (evidenceRefs.length === 0) return null;
  const blockId = `interactive_evidence_${input.nodeRef.refId}`;

  return baseBlock({
    id: blockId,
    kind: "evidence_explorer",
    title: "Evidence explorer",
    learningPurpose: "Inspect source-backed support for this surface.",
    surfaceRole: "supplemental",
    nodeRef: input.nodeRef,
    sourceRefs: input.sourceRefs ?? [],
    evidenceRefs,
    content: {
      evidenceCount: evidenceRefs.length,
      surfaceType: input.surfaceType,
      evidence: learnerEvidenceSpans(evidenceRefs),
      spans: learnerEvidenceSpans(evidenceRefs),
    },
    canonicalState: {
      openedEvidenceRefIds: Array.isArray(blockState.openedEvidenceRefIds)
        ? blockState.openedEvidenceRefIds
        : [],
    },
    allowedActions: ["evidence.source_span_opened", "tutor.help_requested"],
    rendererPreference: "mcp_app",
    fallbackSummary: `${evidenceRefs.length} source-backed evidence item(s).`,
    quality: {
      sourceBacked: true,
      needsReview: false,
    },
  });
}

export async function buildInteractiveBlocksForSurface(
  ctx: AppContext,
  input: BuildInteractiveBlocksInput,
): Promise<InteractiveLearningBlock[]> {
  const evidenceRefs = sanitizeLearnerEvidenceRefs(input.evidenceRefs ?? [], false);
  const blocks: InteractiveLearningBlock[] = [];

  if (input.artifact && artifactIsLearnerVisible(input.artifact)) {
    const sourceRefs = normalizeNodeRefs(input.artifact.sourceNodeRefsJson);
    const claimRefs: NodeRef[] = (input.artifact.sourceClaimIds ?? []).map((refId) => ({
      refType: "claim",
      refId,
    }));
    const chunkRefs: NodeRef[] = (input.artifact.sourceChunkIds ?? []).map((refId) => ({
      refType: "chunk",
      refId,
    }));
    const mergedSourceRefs = [
      ...(input.sourceRefs ?? []),
      ...sourceRefs,
      ...claimRefs,
      ...chunkRefs,
    ];

    if (input.artifact.artifactType === "quiz") {
      const attempts = await loadQuizAttempts(
        ctx,
        input.notebookId,
        input.artifact.id,
        input.userId,
      );
      blocks.push(
        buildQuizBlock(input.artifact, mergedSourceRefs, evidenceRefs, attempts, input.nodeRef),
      );
    } else if (input.artifact.artifactType === "flashcards") {
      blocks.push(
        buildFlashcardDeckBlock(input.artifact, mergedSourceRefs, evidenceRefs, input.nodeRef),
      );
    } else if (input.artifact.artifactType === "worked_example") {
      blocks.push(
        buildWorkedExampleBlock(input.artifact, mergedSourceRefs, evidenceRefs, input.nodeRef),
      );
    } else if (input.artifact.artifactType === "comparison_page") {
      blocks.push(
        buildComparisonBlock(input.artifact, mergedSourceRefs, evidenceRefs, input.nodeRef),
      );
    }
  }

  const evidenceBlockId = `interactive_evidence_${input.nodeRef.refId}`;
  const evidenceState = await loadInteractiveBlockState(ctx, input.notebookId, evidenceBlockId);
  const includeSurfaceDefaults = input.includeSurfaceDefaults !== false;
  if (includeSurfaceDefaults) {
    const evidenceExplorer = buildEvidenceExplorerBlock(input, evidenceRefs, evidenceState);
    if (evidenceExplorer) blocks.push(evidenceExplorer);
  }

  return blocks;
}

export function buildLivePlanBlock(
  studyState: {
    currentObjective?: { id: string; title: string } | null;
    upcomingObjectives?: Array<{ id: string; title: string }>;
    weakConcepts?: Array<{ id: string; name: string }>;
    completedObjectiveIds?: string[];
  },
  nodeRef: NodeRef,
): InteractiveLearningBlock {
  return baseBlock({
    id: `interactive_live_plan_${nodeRef.refId}`,
    kind: "live_plan",
    title: "Live Plan",
    learningPurpose: "See current objectives, weak concepts, and choose next study actions.",
    nodeRef,
    content: {
      currentObjective: studyState.currentObjective ?? null,
      upcomingObjectives: studyState.upcomingObjectives ?? [],
      weakConcepts: studyState.weakConcepts ?? [],
      completedCount: studyState.completedObjectiveIds?.length ?? 0,
      nextActions: [
        { id: "continue_objective", label: "Continue current objective" },
        { id: "review_weak_concepts", label: "Review weak concepts" },
        { id: "slow_down", label: "Slow down pace" },
        { id: "go_deeper", label: "Go deeper on this topic" },
      ],
    },
    canonicalState: {
      selectedActionId: null,
    },
    allowedActions: ["live_plan.action_selected", "tutor.help_requested"],
    fallbackSummary: "Your adaptive study plan dashboard.",
    quality: { sourceBacked: false, needsReview: false },
  });
}

export function buildSourceReaderBlock(
  input: BuildInteractiveBlocksInput,
  evidenceRefs: EvidenceRef[],
  blockState: Record<string, unknown>,
): InteractiveLearningBlock {
  const blockId = `interactive_source_reader_${input.nodeRef.refId}`;
  return baseBlock({
    id: blockId,
    kind: "source_reader",
    title: "Source reader",
    learningPurpose: "Read the source with concept overlays and tutor handoff.",
    nodeRef: input.nodeRef,
    sourceRefs: input.sourceRefs ?? [],
    evidenceRefs,
    content: {
      sourceId: input.nodeRef.refId,
      surfaceType: input.surfaceType,
      evidence: learnerEvidenceSpans(evidenceRefs),
    },
    canonicalState: {
      annotations: Array.isArray(blockState.annotations) ? blockState.annotations : [],
      selectedSpanId:
        typeof blockState.selectedSpanId === "string" ? blockState.selectedSpanId : null,
    },
    allowedActions: [
      "source_reader.annotation_created",
      "evidence.source_span_opened",
      "tutor.help_requested",
    ],
    rendererPreference: "mcp_app",
    fallbackSummary: "Interactive source reading surface.",
    quality: { sourceBacked: true, needsReview: false },
  });
}

export async function buildPersonalizationControlsBlock(
  ctx: AppContext,
  notebookId: string,
  userId: string | undefined,
  nodeRef: NodeRef,
): Promise<InteractiveLearningBlock> {
  const blockId = `interactive_personalization_${nodeRef.refId}`;
  const blockState = userId ? await loadInteractiveBlockState(ctx, notebookId, blockId) : {};
  const profileState = userId
    ? await loadPersonalizationCanonicalState(ctx, notebookId, userId)
    : { updatedPreferences: [] };

  return baseBlock({
    id: blockId,
    kind: "personalization_controls",
    title: "Learning preferences",
    learningPurpose: "Set explicit pace, depth, and study style preferences.",
    nodeRef,
    content: {
      preferences: [
        {
          key: "pace",
          label: "Pace",
          options: [
            { value: "slow", label: "Slower" },
            { value: "balanced", label: "Balanced" },
            { value: "fast", label: "Faster" },
          ],
        },
        {
          key: "depth",
          label: "Depth",
          options: [
            { value: "intuitive", label: "Overview" },
            { value: "balanced", label: "Balanced" },
            { value: "formal", label: "Deep dive" },
          ],
        },
        {
          key: "examples",
          label: "Examples",
          options: [
            { value: "concrete", label: "Fewer" },
            { value: "applied", label: "Balanced" },
            { value: "visual", label: "More" },
          ],
        },
        {
          key: "assessment",
          label: "Assessment style",
          options: [
            { value: "checkpoint", label: "Light" },
            { value: "worked_problem", label: "Balanced" },
            { value: "quiz", label: "Rigorous" },
          ],
        },
        {
          key: "urgency",
          label: "Urgency",
          options: [
            { value: "exploratory", label: "Relaxed" },
            { value: "deadline_pressure", label: "Balanced" },
            { value: "exam_prep", label: "Exam prep" },
          ],
        },
      ],
    },
    canonicalState: {
      ...profileState,
      ...blockState,
    },
    allowedActions: ["personalization.preference_updated", "tutor.help_requested"],
    rendererPreference: "mcp_app",
    fallbackSummary: "Adjust how StudyAgent personalizes your learning.",
    quality: { sourceBacked: false, needsReview: false },
  });
}

export function buildDevTraceDashboardBlock(
  nodeRef: NodeRef,
  surfaceId: string,
): InteractiveLearningBlock {
  return baseBlock({
    id: `interactive_dev_trace_${surfaceId}`,
    kind: "dev_trace_dashboard",
    title: "Interactive learning diagnostics",
    learningPurpose: "Inspect bridge lifecycle, actions, and block state in Dev Mode.",
    surfaceRole: "supplemental",
    nodeRef,
    content: {
      surfaceId,
      diagnosticsFocus: ["bridge", "actions", "canonical_state"],
    },
    canonicalState: {
      recentActions: [],
    },
    allowedActions: ["tutor.help_requested"],
    rendererPreference: "mcp_app",
    fallbackSummary: "Developer diagnostics for interactive learning surfaces.",
    quality: { sourceBacked: false, needsReview: false },
  });
}

export function findInteractiveBlock(
  blocks: InteractiveLearningBlock[],
  blockId: string,
): InteractiveLearningBlock | null {
  return blocks.find((block) => block.id === blockId) ?? null;
}

export function actionAllowedForBlock(
  block: InteractiveLearningBlock,
  actionName: InteractiveLearningActionName,
): boolean {
  return block.allowedActions.includes(actionName);
}

export function toLearnerFacingInteractiveBlock(
  block: InteractiveLearningBlock,
): InteractiveLearningBlock {
  return {
    ...block,
    evidenceRefs: sanitizeLearnerEvidenceRefs(block.evidenceRefs ?? [], false),
  };
}
