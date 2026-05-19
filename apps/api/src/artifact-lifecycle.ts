import type { LearningArtifactView, NodeRef } from "@studyagent/schemas";

export type ArtifactLifecycleStatus =
  | "draft"
  | "proposed"
  | "ready"
  | "rejected"
  | "failed"
  | "archived";

export type ArtifactLearnerVisibility = "hidden" | "learner";
export type ArtifactConsentPolicy = "auto_create" | "propose" | "draft_only";
export type ArtifactLifecycleAction = "approve" | "reject" | "archive";

export type ArtifactQualityDecision = LearningArtifactView["quality"] & {
  canBecomeReady: boolean;
  learnerSummary: string | null;
  developerDiagnostics: string[];
};

export type ArtifactLifecycleTransition = {
  from: ArtifactLifecycleStatus;
  to: ArtifactLifecycleStatus;
  valid: boolean;
  reason?: string;
};

export type ArtifactQualityInput = {
  artifactType: string;
  status: ArtifactLifecycleStatus | string;
  payload: Record<string, unknown>;
  sourceRefs?: NodeRef[];
};

export type ArtifactLifecycleOutcome = {
  requestedStatus: Extract<ArtifactLifecycleStatus, "draft" | "proposed" | "ready">;
  status: Extract<ArtifactLifecycleStatus, "draft" | "proposed" | "ready">;
  visibility: ArtifactLearnerVisibility;
  approvalRequired: boolean;
  transition: ArtifactLifecycleTransition;
  qualityGate: {
    canBecomeReady: boolean;
    downgradedFromReady: boolean;
  };
};

export type ArtifactLifecycleTransitionResult = {
  allowed: boolean;
  transition: ArtifactLifecycleTransition;
  nextStatus: ArtifactLifecycleStatus;
  visibility: ArtifactLearnerVisibility;
  quality: ArtifactQualityDecision;
  eventType: string | null;
  approvalRequired: boolean;
  reason?: string | undefined;
};

const LEARNER_VISIBLE_TYPES = new Set([
  "note",
  "quiz",
  "flashcards",
  "worked_example",
  "formula_sheet",
  "comparison_page",
  "diagram",
  "revision_plan",
  "concept_card",
  "session_digest",
  "wiki_page",
]);

const INTERNAL_TYPES = new Set(["session_plan", "teaching_arc", "study_plan"]);

const ALLOWED_TRANSITIONS: Record<ArtifactLifecycleStatus, ArtifactLifecycleStatus[]> = {
  draft: ["draft", "proposed", "ready", "failed", "archived"],
  proposed: ["proposed", "draft", "ready", "rejected", "failed", "archived"],
  ready: ["ready", "proposed", "failed", "archived"],
  rejected: ["rejected", "draft", "archived"],
  failed: ["failed", "draft", "archived"],
  archived: ["archived"],
};

const SUPPORTED_ARTIFACT_TYPES = [
  "note",
  "quiz",
  "flashcards",
  "worked_example",
  "formula_sheet",
  "comparison_page",
  "concept_card",
  "session_digest",
  "revision_plan",
  "diagram",
] as const;

export function normalizeArtifactLifecycleStatus(
  status: string,
): ArtifactLifecycleStatus | null {
  const normalized = status.trim().toLowerCase();
  if (normalized === "approved" || normalized === "saved") return "ready";
  if (normalized === "superseded") return "archived";
  if (
    normalized === "draft" ||
    normalized === "proposed" ||
    normalized === "ready" ||
    normalized === "rejected" ||
    normalized === "failed" ||
    normalized === "archived"
  ) {
    return normalized;
  }
  return null;
}

export function validateArtifactTransition(
  from: ArtifactLifecycleStatus,
  to: ArtifactLifecycleStatus,
): ArtifactLifecycleTransition {
  const valid = ALLOWED_TRANSITIONS[from].includes(to);
  if (valid) return { from, to, valid };

  return {
    from,
    to,
    valid,
    reason:
      from === "archived"
        ? "Archived artifacts are terminal."
        : `Artifact cannot transition from ${from} to ${to}.`,
  };
}

export function deriveArtifactLifecycleEventType(
  previousStatus: string,
  nextStatus: string,
): string | null {
  const from = normalizeArtifactLifecycleStatus(previousStatus) ?? previousStatus;
  const to = normalizeArtifactLifecycleStatus(nextStatus) ?? nextStatus;
  if (to === "ready" && from !== "ready") {
    return "artifact.approved";
  }
  if (to === "rejected") {
    return "artifact.rejected";
  }
  if (to === "proposed" && from !== "proposed") {
    return "artifact.proposed";
  }
  if (to === "draft" && from === "proposed") {
    return "artifact.updated";
  }
  if (to === "archived" && from !== "archived") {
    return "artifact.archived";
  }
  return null;
}

export function learnerVisibilityForArtifact(input: {
  artifactType: string;
  status: ArtifactLifecycleStatus | string;
}): ArtifactLearnerVisibility {
  if (INTERNAL_TYPES.has(input.artifactType)) return "hidden";
  if (!LEARNER_VISIBLE_TYPES.has(input.artifactType)) return "hidden";
  const status = normalizeArtifactLifecycleStatus(String(input.status)) ?? input.status;
  return status === "ready" || status === "proposed" ? "learner" : "hidden";
}

export function resolveArtifactConsentPolicy(
  artifactConsent: Record<string, unknown>,
  artifactType: string,
): ArtifactConsentPolicy {
  const perType = isJsonRecord(artifactConsent.perType) ? artifactConsent.perType : {};
  const rawPolicy = perType[artifactType];
  if (rawPolicy === "auto_create" || rawPolicy === "propose" || rawPolicy === "draft_only") {
    return rawPolicy;
  }
  return "propose";
}

function resolveRequestedArtifactStatus(
  artifactConsent: Record<string, unknown>,
  artifactType: string,
  requestedStatus?: Extract<ArtifactLifecycleStatus, "draft" | "proposed" | "ready">,
): Extract<ArtifactLifecycleStatus, "draft" | "proposed" | "ready"> {
  const autoCreateLearnerArtifacts = artifactConsent.autoCreateLearnerArtifacts === true;
  const autoCreateNotes = artifactConsent.autoCreateNotes === true;
  const policy = resolveArtifactConsentPolicy(artifactConsent, artifactType);

  if (requestedStatus === "ready") {
    return "ready";
  }

  if (policy === "auto_create") {
    return "ready";
  }
  if (policy === "draft_only") {
    return "draft";
  }

  if (artifactType === "note") {
    return autoCreateNotes || autoCreateLearnerArtifacts ? "ready" : "draft";
  }

  return autoCreateLearnerArtifacts ? "ready" : "proposed";
}

export function resolveArtifactLifecycleOutcome(input: {
  artifactType: string;
  artifactConsent: Record<string, unknown>;
  requestedStatus?: Extract<ArtifactLifecycleStatus, "draft" | "proposed" | "ready">;
  payload: Record<string, unknown>;
  sourceRefs?: NodeRef[];
}): {
  lifecycle: ArtifactLifecycleOutcome;
  quality: ArtifactQualityDecision;
  warnings: Array<{ code: string; message: string }>;
} {
  const requestedStatus = resolveRequestedArtifactStatus(
    input.artifactConsent,
    input.artifactType,
    input.requestedStatus,
  );
  const requestedTransition = validateArtifactTransition("draft", requestedStatus);
  const initialStatus = requestedTransition.valid ? requestedStatus : "draft";
  const qualityGate = decideArtifactQuality({
    artifactType: input.artifactType,
    status: initialStatus,
    payload: input.payload,
    sourceRefs: input.sourceRefs ?? [],
  });
  const finalStatus: Extract<ArtifactLifecycleStatus, "draft" | "proposed" | "ready"> =
    initialStatus === "ready" && !qualityGate.canBecomeReady ? "proposed" : initialStatus;
  const transition = validateArtifactTransition("draft", finalStatus);
  const quality = decideArtifactQuality({
    artifactType: input.artifactType,
    status: finalStatus,
    payload: input.payload,
    sourceRefs: input.sourceRefs ?? [],
  });
  const visibility = learnerVisibilityForArtifact({
    artifactType: input.artifactType,
    status: finalStatus,
  });
  const lifecycle: ArtifactLifecycleOutcome = {
    requestedStatus,
    status: finalStatus,
    visibility,
    approvalRequired: finalStatus === "proposed",
    transition,
    qualityGate: {
      canBecomeReady: qualityGate.canBecomeReady,
      downgradedFromReady: initialStatus === "ready" && finalStatus !== "ready",
    },
  };
  const warnings: Array<{ code: string; message: string }> = [];

  if (!requestedTransition.valid) {
    warnings.push({
      code: "artifact_lifecycle_transition_invalid",
      message: requestedTransition.reason ?? "Artifact lifecycle transition was not valid.",
    });
  }
  if (lifecycle.qualityGate.downgradedFromReady) {
    warnings.push({
      code: "artifact_quality_gate_failed",
      message: "Artifact was proposed for review because it did not pass ready quality gates.",
    });
  }

  return { lifecycle, quality, warnings };
}

export function applyArtifactLifecycleAction(input: {
  action: ArtifactLifecycleAction;
  artifactType: string;
  currentStatus: string;
  payload: Record<string, unknown>;
  sourceRefs?: NodeRef[];
}): ArtifactLifecycleTransitionResult {
  const from =
    normalizeArtifactLifecycleStatus(input.currentStatus) ??
    (input.currentStatus as ArtifactLifecycleStatus);
  const to =
    input.action === "approve"
      ? "ready"
      : input.action === "reject"
        ? "rejected"
        : "archived";
  const transition = validateArtifactTransition(from, to);
  const quality = decideArtifactQuality({
    artifactType: input.artifactType,
    status: to,
    payload: input.payload,
    sourceRefs: input.sourceRefs ?? [],
  });
  const visibility = learnerVisibilityForArtifact({
    artifactType: input.artifactType,
    status: to,
  });

  if (!transition.valid) {
    return {
      allowed: false,
      transition,
      nextStatus: from,
      visibility: learnerVisibilityForArtifact({
        artifactType: input.artifactType,
        status: from,
      }),
      quality,
      eventType: null,
      approvalRequired: from === "proposed",
      reason: transition.reason,
    };
  }

  if (input.action === "approve" && !quality.canBecomeReady) {
    return {
      allowed: false,
      transition,
      nextStatus: from,
      visibility: learnerVisibilityForArtifact({
        artifactType: input.artifactType,
        status: from,
      }),
      quality,
      eventType: null,
      approvalRequired: from === "proposed",
      reason:
        quality.learnerSummary ??
        "Artifact needs more content or source support before it can be marked ready.",
    };
  }

  return {
    allowed: true,
    transition,
    nextStatus: to,
    visibility,
    quality,
    eventType: deriveArtifactLifecycleEventType(from, to),
    approvalRequired: nextStatusRequiresApproval(to),
  };
}

function nextStatusRequiresApproval(status: ArtifactLifecycleStatus): boolean {
  return status === "proposed";
}

export function qualityToLearningArtifactView(
  decision: ArtifactQualityDecision,
): LearningArtifactView["quality"] {
  return {
    sourceBacked: decision.sourceBacked,
    needsReview: decision.needsReview,
    issues: decision.issues,
  };
}

export function decideArtifactQuality(input: ArtifactQualityInput): ArtifactQualityDecision {
  const issues: string[] = [];
  const developerDiagnostics: string[] = [];
  const sourceRefs = input.sourceRefs ?? [];
  const sourceBacked = sourceRefs.length > 0;

  if (expectsSources(input.artifactType) && !sourceBacked) {
    issues.push("Needs source support.");
    developerDiagnostics.push("quality:missing_source_refs");
  }
  for (const issue of typeSpecificQualityIssues(input.artifactType, input.payload)) {
    issues.push(issue);
    developerDiagnostics.push(`quality:${slugIssue(issue)}`);
  }
  if (containsPlaceholder(input.payload)) {
    issues.push("Contains placeholder text.");
    developerDiagnostics.push("quality:placeholder_content");
  }
  const normalizedStatus = normalizeArtifactLifecycleStatus(String(input.status)) ?? input.status;
  if (normalizedStatus !== "ready") {
    issues.push("Needs review before treating it as final.");
    developerDiagnostics.push(`quality:status_${normalizedStatus}`);
  }

  const blockingIssues = issues.filter(
    (issue) => issue !== "Needs review before treating it as final.",
  );

  return {
    sourceBacked,
    needsReview: issues.length > 0,
    issues,
    canBecomeReady: blockingIssues.length === 0,
    learnerSummary: learnerQualitySummary(issues),
    developerDiagnostics,
  };
}

export const ARTIFACT_LIFECYCLE_SUPPORTED_TYPES = SUPPORTED_ARTIFACT_TYPES;

function learnerQualitySummary(issues: string[]): string | null {
  if (!issues.length) return null;
  const blocking = issues.filter((issue) => issue !== "Needs review before treating it as final.");
  if (!blocking.length) {
    return "This artifact is still waiting for review before it becomes study-ready.";
  }
  if (blocking.length === 1) return blocking[0]!;
  return `${blocking[0]} (+${blocking.length - 1} more quality issue${blocking.length > 2 ? "s" : ""})`;
}

function expectsSources(type: string): boolean {
  return !["session_plan", "teaching_arc", "revision_plan"].includes(type);
}

function typeSpecificQualityIssues(type: string, payload: Record<string, unknown>): string[] {
  const issues: string[] = [];

  if (type === "note") {
    const markdown = stringOrNull(payload.markdown ?? payload.noteMarkdown ?? payload.body);
    const personalization = isRecord(payload.personalization) ? payload.personalization : null;
    const personalizedSections = Array.isArray(personalization?.sections) ? personalization.sections : [];
    const personalizedBodies = personalizedSections.filter(
      (section) => isRecord(section) && stringOrNull(section.body as string)?.length,
    );
    if (personalizedBodies.length > 0) {
      if (!markdown) {
        issues.push("Personalized note needs a short overview or personalized sections.");
      }
    } else if (!markdown || markdown.length < 400) {
      issues.push("Note needs a substantive overview body.");
    }
  }

  if (type === "quiz") {
    const questions = Array.isArray(payload.questions) ? payload.questions : [];
    if (!questions.length) issues.push("Quiz needs actual questions.");
    if (
      questions.some(
        (question) =>
          isRecord(question) && !stringOrNull(question.answer ?? question.referenceAnswer),
      )
    ) {
      issues.push("Quiz questions need answers or reference answers.");
    }
  }

  if (type === "flashcards") {
    const cards = Array.isArray(payload.cards) ? payload.cards : [];
    if (!cards.length) issues.push("Flashcards need card prompts and answers.");
    if (
      cards.some(
        (card) =>
          isRecord(card) &&
          (!stringOrNull(card.front ?? card.prompt) || !stringOrNull(card.back ?? card.answer)),
      )
    ) {
      issues.push("Flashcards need front/back content.");
    }
  }

  if (type === "worked_example") {
    const steps = payload.solutionSteps ?? payload.steps;
    if (!stringOrNull(payload.problemStatement ?? payload.problem))
      issues.push("Worked example needs a problem.");
    if (!Array.isArray(steps) || !steps.length) issues.push("Worked example needs solution steps.");
    if (!stringOrNull(payload.finalTakeaway ?? payload.takeaway))
      issues.push("Worked example needs a final takeaway.");
  }

  if (type === "formula_sheet" && (!Array.isArray(payload.formulas) || !payload.formulas.length)) {
    issues.push("Formula sheet needs formula rows.");
  }

  const comparisonRows = payload.comparisonRows ?? payload.rows ?? payload.items;
  if (type === "comparison_page" && (!Array.isArray(comparisonRows) || !comparisonRows.length)) {
    issues.push("Comparison page needs comparison rows.");
  }

  if (type === "concept_card") {
    if (!stringOrNull(payload.definition)) issues.push("Concept card needs a definition.");
    if (!stringOrNull(payload.whenToUse)) issues.push("Concept card needs a when-to-use note.");
  }

  if (type === "session_digest") {
    const nextActions = payload.nextActions ?? payload.actionItems;
    const hasNext = Array.isArray(nextActions) && nextActions.length > 0;
    const hasCoverage =
      Array.isArray(payload.coverageUpdates) && payload.coverageUpdates.length > 0;
    if (!stringOrNull(payload.summary ?? payload.takeaway))
      issues.push("Session digest needs a summary.");
    if (!hasNext && !hasCoverage)
      issues.push("Session digest needs next actions or coverage updates.");
  }

  return issues;
}

function containsPlaceholder(value: unknown): boolean {
  const text = JSON.stringify(value).toLowerCase();
  return /\b(todo|placeholder|lorem ipsum|mock data|sample only)\b/.test(text);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

function slugIssue(issue: string): string {
  return issue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
