import type { ReferenceBlock, ReferenceSurface } from "@studyagent/schemas";
import { learnerFacingSurfaceStatus, learnerSafeCopy } from "@studyagent/schemas";

export type ArtifactReviewInput = {
  id: string;
  title: string;
  artifactType: string;
  status: string | null;
  view?: {
    quality: { sourceBacked: boolean; needsReview: boolean; issues: string[] };
    confidence: number | null;
  } | null;
  sourceNodeRefs?: Array<{ refType: string; refId: string }>;
};

export type ArtifactReviewActionId =
  | "approve"
  | "reject"
  | "ask_tutor"
  | "practice"
  | "review"
  | "save";

export type ArtifactReviewView = {
  title: string;
  typeLabel: string;
  statusLabel: string | null;
  qualityLabel: string;
  actions: ArtifactReviewActionId[];
};

const ARTIFACT_TYPE_LABELS: Record<string, string> = {
  quiz: "Quiz",
  flashcards: "Flashcards",
  worked_example: "Worked example",
  note: "Note",
};

function artifactTypeLabel(artifactType: string): string {
  return ARTIFACT_TYPE_LABELS[artifactType] ?? learnerSafeCopy(artifactType.replace(/_/g, " "));
}

export function referenceSurfaceHasQuizPractice(surface: ReferenceSurface): boolean {
  return (
    surface.surfaceType === "artifact" &&
    surface.blocks.some((block) => block.kind === "question_list")
  );
}

export function referenceSurfaceHasFlashcards(surface: ReferenceSurface): boolean {
  return (
    surface.surfaceType === "artifact" &&
    surface.blocks.some((block) => block.kind === "flashcard_list")
  );
}

export function isQuizArtifactSurface(surface: ReferenceSurface): boolean {
  return referenceSurfaceHasQuizPractice(surface);
}

function interactiveBlockKinds(surface: ReferenceSurface): Set<string> {
  return new Set((surface.interactiveBlocks ?? []).map((block) => block.kind));
}

function duplicateNativeBlock(surface: ReferenceSurface, block: ReferenceBlock): boolean {
  if (surface.surfaceType !== "artifact") return false;
  const interactive = interactiveBlockKinds(surface);
  const artifactType = inferArtifactTypeFromSurface(surface);
  if (artifactType === "quiz" && block.kind === "question_list" && interactive.has("quiz"))
    return true;
  if (
    artifactType === "flashcards" &&
    block.kind === "flashcard_list" &&
    interactive.has("flashcard_deck")
  ) {
    return true;
  }
  if (
    artifactType === "worked_example" &&
    block.kind === "step_list" &&
    interactive.has("worked_example")
  ) {
    return true;
  }
  return false;
}

export function visibleReferenceBlocks(surface: ReferenceSurface): ReferenceBlock[] {
  return surface.blocks.filter((block) => {
    if (duplicateNativeBlock(surface, block)) return false;
    if (isQuizArtifactSurface(surface) && block.id === "overview") return false;
    if (
      isQuizArtifactSurface(surface) &&
      block.kind === "markdown" &&
      block.title?.toLowerCase() === "practice goal"
    ) {
      return false;
    }
    return true;
  });
}

export function inferArtifactTypeFromSurface(surface: ReferenceSurface): string {
  if (referenceSurfaceHasQuizPractice(surface)) return "quiz";
  if (referenceSurfaceHasFlashcards(surface)) return "flashcards";
  if (surface.blocks.some((block) => block.kind === "step_list")) return "worked_example";
  return "note";
}

export function artifactReviewInputFromReferenceSurface(
  surface: ReferenceSurface,
): ArtifactReviewInput {
  return {
    id: surface.nodeRef.refId,
    title: surface.title,
    artifactType: inferArtifactTypeFromSurface(surface),
    status: surface.status,
    view: {
      confidence: surface.quality.confidence,
      quality: {
        sourceBacked: surface.quality.sourceBacked,
        needsReview: surface.quality.needsReview,
        issues: [],
      },
    },
  };
}

export function artifactReviewInputFromArtifact(
  artifact: ArtifactReviewInput,
): ArtifactReviewInput {
  return artifact;
}

export function buildArtifactReviewView(artifact: ArtifactReviewInput): ArtifactReviewView {
  const needsApproval = artifact.status === "proposed" || artifact.status === "draft";
  const isQuiz = artifact.artifactType === "quiz";
  const isNote = artifact.artifactType === "note";
  const needsReview = artifact.view?.quality.needsReview === true;

  return {
    title: artifact.title,
    typeLabel: artifactTypeLabel(artifact.artifactType),
    statusLabel: learnerFacingSurfaceStatus({
      surfaceType: "artifact",
      status: artifact.status,
      quality: {
        confidence: artifact.view?.confidence ?? null,
        sourceBacked: artifact.view?.quality.sourceBacked ?? false,
        needsReview,
      },
    }),
    qualityLabel: needsReview ? "Needs review" : "Ready",
    actions: [
      ...(needsApproval ? (["approve", "reject"] as const) : []),
      isQuiz ? "practice" : "review",
      "ask_tutor",
      ...(isNote ? (["save"] as const) : []),
    ],
  };
}

export function artifactReviewFromReferenceSurface(surface: ReferenceSurface): ArtifactReviewView {
  return buildArtifactReviewView(artifactReviewInputFromReferenceSurface(surface));
}

export function artifactSurfaceActionIds(
  artifact: ArtifactReviewInput,
): ReferenceSurface["primaryActions"] {
  return artifact.artifactType === "quiz"
    ? ["ask_tutor", "quiz", "regenerate", "open_evidence"]
    : ["ask_tutor", "review", "regenerate", "open_evidence"];
}

const ARTIFACT_REVIEW_TO_SURFACE_ACTION: Record<
  ArtifactReviewActionId,
  ReferenceSurface["primaryActions"][number] | null
> = {
  approve: null,
  reject: null,
  ask_tutor: "ask_tutor",
  practice: "quiz",
  review: "review",
  save: null,
};

export function referenceSurfaceActionsForArtifactReview(
  review: ArtifactReviewView,
): ReferenceSurface["primaryActions"] {
  return review.actions
    .map((action) => ARTIFACT_REVIEW_TO_SURFACE_ACTION[action])
    .filter((action): action is ReferenceSurface["primaryActions"][number] => action !== null);
}

export function artifactReviewMatchesPrimaryActions(
  review: ArtifactReviewView,
  primaryActions: ReferenceSurface["primaryActions"],
): boolean {
  const expected = referenceSurfaceActionsForArtifactReview(review);
  const authored = new Set(primaryActions);
  for (const action of expected) {
    if (!authored.has(action)) return false;
  }
  return true;
}

export function artifactQuizSelfAssessmentLabels(): {
  understood: string;
  needsReview: string;
  sectionTitle: string;
} {
  return {
    sectionTitle: "Practice",
    understood: "I got this",
    needsReview: "Needs review",
  };
}

export function buildTutorPanelArtifactReview(
  artifact: ArtifactReviewInput,
  surface?: ReferenceSurface | null,
): ArtifactReviewView {
  const review = surface
    ? artifactReviewFromReferenceSurface(surface)
    : buildArtifactReviewView(artifact);
  const needsApproval = artifact.status === "proposed" || artifact.status === "draft";
  const lifecycleActions = needsApproval ? (["approve", "reject"] as const) : [];
  const saveAction = artifact.artifactType === "note" && !needsApproval ? (["save"] as const) : [];
  const mergedActions = [
    ...lifecycleActions,
    ...review.actions.filter((action) => action !== "save"),
    ...saveAction,
  ];
  return {
    ...review,
    actions: [...new Set(mergedActions)],
  };
}

export function buildTutorPromptForArtifactAction(
  review: ArtifactReviewView,
  actionId: ArtifactReviewActionId,
): string {
  if (actionId === "practice") return `Give me source-grounded practice for "${review.title}".`;
  if (actionId === "review")
    return `Review "${review.title}" with me and focus on what I should understand next.`;
  if (actionId === "ask_tutor") return `Teach me "${review.title}" using the selected reference.`;
  return `Help me with "${review.title}".`;
}
