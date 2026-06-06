import { describe, expect, it } from "vitest";
import type { ReferenceSurface } from "@studyagent/schemas";
import {
  artifactReviewFromReferenceSurface,
  artifactReviewMatchesPrimaryActions,
  artifactQuizSelfAssessmentLabels,
  artifactSurfaceActionIds,
  buildArtifactReviewView,
  buildTutorPanelArtifactReview,
  referenceSurfaceActionsForArtifactReview,
} from "./artifact-review.js";
import { actionsForReferenceSurface } from "./reference-surface-actions.js";

const quizSurface: ReferenceSurface = {
  id: "surface_quiz",
  notebookId: "nb_1",
  nodeRef: { refType: "artifact", refId: "artifact_quiz" },
  title: "Quiz",
  surfaceType: "artifact",
  summary: null,
  status: "ready",
  blocks: [{
    id: "questions",
    kind: "question_list",
    title: "Questions",
    content: [{ id: "q1", prompt: "What is x?", choices: ["x", "y"], answer: "x" }],
    evidenceRefs: [],
  }],
  scopeRefs: [],
  sourceRefs: [],
  provenanceRefs: [],
  coverageRefs: [],
  primaryActions: ["ask_tutor", "quiz", "regenerate", "open_evidence"],
  quality: { confidence: 0.9, sourceBacked: true, needsReview: false },
};

describe("artifact review parity", () => {
  it("derives the same tutor-facing action families from artifact input and reference surfaces", () => {
    const review = buildArtifactReviewView({
      id: "artifact_quiz",
      title: "Quiz",
      artifactType: "quiz",
      status: "ready",
      view: { confidence: 0.9, quality: { sourceBacked: true, needsReview: false, issues: [] } },
    });
    expect(referenceSurfaceActionsForArtifactReview(review)).toEqual(["quiz", "ask_tutor"]);
    expect(artifactSurfaceActionIds({
      id: "artifact_quiz",
      title: "Quiz",
      artifactType: "quiz",
      status: "ready",
    })).toEqual(quizSurface.primaryActions);
  });

  it("matches API-authored primary actions for quiz and note artifacts", () => {
    const quizReview = artifactReviewFromReferenceSurface(quizSurface);
    expect(artifactReviewMatchesPrimaryActions(quizReview, quizSurface.primaryActions)).toBe(true);

    const noteSurface: ReferenceSurface = {
      ...quizSurface,
      id: "surface_note",
      nodeRef: { refType: "artifact", refId: "artifact_note" },
      title: "Note",
      blocks: [{ id: "body", kind: "markdown", title: "Note", content: "Body", evidenceRefs: [] }],
      primaryActions: ["ask_tutor", "review", "regenerate", "open_evidence"],
    };
    const noteReview = artifactReviewFromReferenceSurface(noteSurface);
    expect(artifactReviewMatchesPrimaryActions(noteReview, noteSurface.primaryActions)).toBe(true);
  });

  it("exposes shared quiz self-assessment labels for tutor and full-panel surfaces", () => {
    expect(artifactQuizSelfAssessmentLabels()).toEqual({
      sectionTitle: "Practice",
      understood: "I got this",
      needsReview: "Needs review",
    });
  });

  it("aligns TutorPanel review actions with FullPanelViewer primary actions", () => {
    const tutorReview = buildTutorPanelArtifactReview({
      id: "artifact_quiz",
      title: "Quiz",
      artifactType: "quiz",
      status: "ready",
      view: { confidence: 0.9, quality: { sourceBacked: true, needsReview: false, issues: [] } },
    }, quizSurface);
    const fullPanelActions = actionsForReferenceSurface({
      surface: quizSurface,
      canLaunchTutor: true,
      canShowEvidence: true,
      canRegenerate: true,
    });

    expect(artifactReviewMatchesPrimaryActions(tutorReview, quizSurface.primaryActions)).toBe(true);
    expect(fullPanelActions.map((action) => action.id)).toEqual(expect.arrayContaining(["quiz", "ask_tutor"]));
  });
});
