import { describe, expect, it } from "vitest";
import type { NodeRef } from "@studyagent/schemas";
import {
  applyArtifactLifecycleAction,
  ARTIFACT_LIFECYCLE_SUPPORTED_TYPES,
  decideArtifactQuality,
  deriveArtifactLifecycleEventType,
  learnerVisibilityForArtifact,
  normalizeArtifactLifecycleStatus,
  resolveArtifactConsentPolicy,
  resolveArtifactLifecycleOutcome,
  validateArtifactTransition,
  type ArtifactLifecycleStatus,
} from "./artifact-lifecycle.js";

const sourceRefs: NodeRef[] = [{ refType: "chunk", refId: "chk_1" }];

describe("validateArtifactTransition", () => {
  it.each([
    ["draft", "proposed"],
    ["proposed", "ready"],
    ["proposed", "rejected"],
    ["ready", "archived"],
    ["failed", "draft"],
    ["rejected", "archived"],
  ] satisfies Array<[ArtifactLifecycleStatus, ArtifactLifecycleStatus]>)(
    "allows %s to %s",
    (from, to) => {
      expect(validateArtifactTransition(from, to)).toMatchObject({ from, to, valid: true });
    },
  );

  it.each([
    ["draft", "rejected"],
    ["ready", "draft"],
    ["rejected", "ready"],
    ["archived", "ready"],
  ] satisfies Array<[ArtifactLifecycleStatus, ArtifactLifecycleStatus]>)(
    "rejects %s to %s",
    (from, to) => {
      expect(validateArtifactTransition(from, to)).toMatchObject({ from, to, valid: false });
    },
  );

  it("normalizes approved/saved/superseded aliases for event derivation", () => {
    expect(normalizeArtifactLifecycleStatus("approved")).toBe("ready");
    expect(normalizeArtifactLifecycleStatus("saved")).toBe("ready");
    expect(normalizeArtifactLifecycleStatus("superseded")).toBe("archived");
    expect(deriveArtifactLifecycleEventType("proposed", "approved")).toBe("artifact.approved");
    expect(deriveArtifactLifecycleEventType("ready", "superseded")).toBe("artifact.archived");
  });
});

describe("learnerVisibilityForArtifact", () => {
  it.each([
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
  ])("shows supported learner type %s when proposed or ready", (artifactType) => {
    expect(learnerVisibilityForArtifact({ artifactType, status: "proposed" })).toBe("learner");
    expect(learnerVisibilityForArtifact({ artifactType, status: "ready" })).toBe("learner");
  });

  it("hides drafts, terminal statuses, internal types, and unknown compatibility types", () => {
    expect(learnerVisibilityForArtifact({ artifactType: "note", status: "draft" })).toBe("hidden");
    expect(learnerVisibilityForArtifact({ artifactType: "quiz", status: "rejected" })).toBe(
      "hidden",
    );
    expect(learnerVisibilityForArtifact({ artifactType: "teaching_arc", status: "ready" })).toBe(
      "hidden",
    );
    expect(learnerVisibilityForArtifact({ artifactType: "session_plan", status: "proposed" })).toBe(
      "hidden",
    );
    expect(learnerVisibilityForArtifact({ artifactType: "legacy_debug", status: "ready" })).toBe(
      "hidden",
    );
  });
});

describe("resolveArtifactConsentPolicy", () => {
  it("reads per-type consent policies with propose fallback", () => {
    const consent = {
      perType: {
        worked_example: "auto_create",
        formula_sheet: "propose",
        comparison_page: "draft_only",
      },
    };
    expect(resolveArtifactConsentPolicy(consent, "worked_example")).toBe("auto_create");
    expect(resolveArtifactConsentPolicy(consent, "formula_sheet")).toBe("propose");
    expect(resolveArtifactConsentPolicy(consent, "comparison_page")).toBe("draft_only");
    expect(resolveArtifactConsentPolicy({}, "formula_sheet")).toBe("propose");
  });
});

describe("resolveArtifactLifecycleOutcome", () => {
  it("uses lifecycle policy helpers to keep draft-only artifacts hidden", () => {
    const result = resolveArtifactLifecycleOutcome({
      artifactType: "formula_sheet",
      artifactConsent: {
        perType: {
          formula_sheet: "draft_only",
        },
      },
      payload: {
        formulas: [{ expression: "F = ma", meaning: "Force equals mass times acceleration." }],
      },
      sourceRefs: [{ refType: "chunk", refId: "chunk_1" }],
    });

    expect(result.lifecycle.status).toBe("draft");
    expect(result.lifecycle.visibility).toBe("hidden");
    expect(result.lifecycle.approvalRequired).toBe(false);
    expect(result.lifecycle.transition).toMatchObject({ from: "draft", to: "draft", valid: true });
    expect(result.quality.needsReview).toBe(true);
    expect(result.quality.issues).toContain("Needs review before treating it as final.");
  });

  it("downgrades auto-created artifacts that fail ready quality gates", () => {
    const result = resolveArtifactLifecycleOutcome({
      artifactType: "quiz",
      artifactConsent: { autoCreateLearnerArtifacts: true },
      payload: {
        questions: [{ prompt: "What is force?", answer: "Mass times acceleration.", conceptIds: [] }],
      },
      sourceRefs: [],
    });

    expect(result.lifecycle.requestedStatus).toBe("ready");
    expect(result.lifecycle.status).toBe("proposed");
    expect(result.lifecycle.visibility).toBe("learner");
    expect(result.lifecycle.approvalRequired).toBe(true);
    expect(result.lifecycle.qualityGate).toEqual({ canBecomeReady: false, downgradedFromReady: true });
    expect(result.quality.issues).toEqual(
      expect.arrayContaining(["Needs source support.", "Needs review before treating it as final."]),
    );
    expect(result.quality.developerDiagnostics).toContain("quality:missing_source_refs");
    expect(result.warnings.map((warning) => warning.code)).toContain("artifact_quality_gate_failed");
  });

  it("allows high-quality source-backed auto-created notes to become ready", () => {
    const result = resolveArtifactLifecycleOutcome({
      artifactType: "note",
      artifactConsent: { autoCreateNotes: true },
      payload: {
        markdown: `${"This note connects acceleration, force, and mass with a concrete study explanation. ".repeat(7)}Use it to remember that the relationship is proportional when mass is fixed.`,
        keyPoints: ["Force changes with mass and acceleration."],
      },
      sourceRefs: [{ refType: "chunk", refId: "chunk_1" }],
    });

    expect(result.lifecycle.status).toBe("ready");
    expect(result.lifecycle.visibility).toBe("learner");
    expect(result.lifecycle.approvalRequired).toBe(false);
    expect(result.quality).toMatchObject({
      sourceBacked: true,
      needsReview: false,
      canBecomeReady: true,
      learnerSummary: null,
    });
    expect(result.warnings).toEqual([]);
  });
});

describe("applyArtifactLifecycleAction", () => {
  it("approves proposed artifacts when quality gates pass", () => {
    const result = applyArtifactLifecycleAction({
      action: "approve",
      artifactType: "worked_example",
      currentStatus: "proposed",
      payload: {
        problemStatement: "Find heat flux.",
        solutionSteps: ["Identify variables.", "Apply Fourier law."],
        finalTakeaway: "Flux follows the gradient.",
      },
      sourceRefs,
    });

    expect(result.allowed).toBe(true);
    expect(result.nextStatus).toBe("ready");
    expect(result.eventType).toBe("artifact.approved");
    expect(result.visibility).toBe("learner");
  });

  it("blocks approval when quality gates fail", () => {
    const result = applyArtifactLifecycleAction({
      action: "approve",
      artifactType: "note",
      currentStatus: "proposed",
      payload: { markdown: "TODO" },
      sourceRefs: [],
    });

    expect(result.allowed).toBe(false);
    expect(result.nextStatus).toBe("proposed");
    expect(result.quality.canBecomeReady).toBe(false);
    expect(result.quality.learnerSummary).toMatch(/placeholder|source support/i);
  });

  it("rejects proposed artifacts and blocks invalid reject transitions", () => {
    const allowed = applyArtifactLifecycleAction({
      action: "reject",
      artifactType: "quiz",
      currentStatus: "proposed",
      payload: { questions: [{ prompt: "Q?", answer: "A" }] },
      sourceRefs,
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.nextStatus).toBe("rejected");
    expect(allowed.eventType).toBe("artifact.rejected");

    const blocked = applyArtifactLifecycleAction({
      action: "reject",
      artifactType: "quiz",
      currentStatus: "draft",
      payload: { questions: [{ prompt: "Q?", answer: "A" }] },
      sourceRefs,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.transition.valid).toBe(false);
  });
});

describe("decideArtifactQuality", () => {
  it.each(ARTIFACT_LIFECYCLE_SUPPORTED_TYPES)("evaluates quality gates for %s", (artifactType) => {
    const quality = decideArtifactQuality({
      artifactType,
      status: "ready",
      sourceRefs,
      payload: samplePayloadForType(artifactType),
    });
    expect(quality.sourceBacked).toBe(true);
    expect(quality.developerDiagnostics.length).toBeGreaterThanOrEqual(0);
  });

  it("accepts a source-backed substantive note as ready quality", () => {
    const quality = decideArtifactQuality({
      artifactType: "note",
      status: "ready",
      sourceRefs,
      payload: {
        markdown: "A".repeat(400),
        keyPoints: ["Use source backed explanations."],
      },
    });

    expect(quality).toMatchObject({
      sourceBacked: true,
      needsReview: false,
      issues: [],
      canBecomeReady: true,
      learnerSummary: null,
    });
  });

  it("flags unsupported quiz and flashcard payload gaps", () => {
    expect(
      decideArtifactQuality({
        artifactType: "quiz",
        status: "ready",
        sourceRefs,
        payload: { questions: [{ prompt: "What is entropy?" }] },
      }).issues,
    ).toContain("Quiz questions need answers or reference answers.");

    expect(
      decideArtifactQuality({
        artifactType: "flashcards",
        status: "ready",
        sourceRefs,
        payload: { cards: [{ front: "Entropy" }] },
      }).issues,
    ).toContain("Flashcards need front/back content.");
  });

  it("flags ungrounded, placeholder, and non-ready artifacts", () => {
    const quality = decideArtifactQuality({
      artifactType: "note",
      status: "proposed",
      sourceRefs: [],
      payload: { markdown: "TODO" },
    });

    expect(quality.needsReview).toBe(true);
    expect(quality.canBecomeReady).toBe(false);
    expect(quality.learnerSummary).toBeTruthy();
    expect(quality.developerDiagnostics).toEqual(
      expect.arrayContaining([
        "quality:missing_source_refs",
        "quality:note_needs_a_substantive_overview_body",
        "quality:placeholder_content",
      ]),
    );
  });
});

describe("tool write lifecycle policy", () => {
  const majorArtifactClasses = [
    "note",
    "quiz",
    "flashcards",
    "worked_example",
    "formula_sheet",
    "comparison_page",
    "concept_card",
  ] as const;

  it.each(majorArtifactClasses)("allows a successful %s creation when consent and quality pass", (artifactType) => {
    const result = resolveArtifactLifecycleOutcome({
      artifactType,
      artifactConsent: { autoCreateLearnerArtifacts: true },
      payload: samplePayloadForType(artifactType),
      sourceRefs,
    });
    expect(["ready", "proposed"]).toContain(result.lifecycle.status);
    expect(result.lifecycle.transition.valid).toBe(true);
    expect(result.quality.sourceBacked).toBe(true);
  });

  it.each(majorArtifactClasses)("blocks or downgrades %s creation when quality fails", (artifactType) => {
    const result = resolveArtifactLifecycleOutcome({
      artifactType,
      artifactConsent: { autoCreateLearnerArtifacts: true },
      payload: { markdown: "TODO" },
      sourceRefs: [],
    });
    expect(result.lifecycle.status).not.toBe("ready");
    expect(result.quality.canBecomeReady).toBe(false);
    expect(result.warnings.map((warning) => warning.code)).toContain("artifact_quality_gate_failed");
  });
});

function samplePayloadForType(artifactType: string): Record<string, unknown> {
  switch (artifactType) {
    case "note":
      return { markdown: "A".repeat(400), keyPoints: ["Point"] };
    case "quiz":
      return { questions: [{ prompt: "Q?", answer: "A" }] };
    case "flashcards":
      return { cards: [{ front: "F", back: "B" }] };
    case "worked_example":
      return {
        problemStatement: "Problem",
        solutionSteps: ["Step"],
        finalTakeaway: "Takeaway",
      };
    case "formula_sheet":
      return { formulas: [{ expression: "x", meaning: "y" }] };
    case "comparison_page":
      return { comparisonRows: [{ dimension: "d", left: "l", right: "r" }] };
    case "concept_card":
      return { definition: "Def", whenToUse: "When" };
    case "session_digest":
      return { summary: "Summary", nextActions: ["Act"] };
    case "revision_plan":
      return { goal: "Review", tasks: ["Task"] };
    case "diagram":
      return { caption: "Diagram", nodes: [{ id: "n1" }] };
    default:
      return {};
  }
}
