import { describe, expect, it } from "vitest";
import {
  buildMasteryEvidenceId,
  masteryEvidenceInputSchema,
  masteryEvidenceSchema,
  parseMasteryEvidence,
} from "./mastery-evidence.js";

const baseEvidence = {
  id: buildMasteryEvidenceId(),
  notebookId: "nb_1",
  userId: "user_1",
  correctnessLabel: "partial" as const,
  overallScore: 0.55,
  conceptScores: [
    { conceptId: "concept_1", score: 0.5, delta: 0.04, role: "primary" as const },
  ],
  misconceptions: [{ conceptId: "concept_1", description: "Confused slope with intercept" }],
  readiness: "developing" as const,
  tutoringIntervention: "guided_practice" as const,
  uncertainty: 0.35,
  confidence: 0.62,
  evidenceType: "mastery_check" as const,
  triggerSource: "runtime_auto" as const,
  sourceRefs: [{ refType: "source" as const, refId: "src_1" }],
  contextRefs: [{ refType: "chunk" as const, refId: "chunk_1" }],
  sessionId: "sess_1",
  turnId: "turn_1",
  runId: "run_1",
  evaluatorProvenance: {
    mode: "deterministic" as const,
    model: null,
    fallbackUsed: false,
    notes: "Exact match scoring",
  },
  learnerAnswerSummary: "Partial derivative of x^2",
  tutorQuestionSummary: "What is the derivative of x^2?",
};

describe("mastery evidence schema", () => {
  it("accepts valid source-backed evidence", () => {
    const parsed = masteryEvidenceSchema.safeParse(baseEvidence);
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid schema payloads", () => {
    const parsed = masteryEvidenceSchema.safeParse({
      ...baseEvidence,
      overallScore: 1.4,
    });
    expect(parsed.success).toBe(false);
  });

  it("represents low-confidence needs-more-evidence results", () => {
    const parsed = masteryEvidenceSchema.safeParse({
      ...baseEvidence,
      correctnessLabel: "needs_more_evidence",
      overallScore: 0.2,
      confidence: 0.25,
      uncertainty: 0.85,
      tutoringIntervention: "quick_check",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.correctnessLabel).toBe("needs_more_evidence");
  });

  it("accepts self-report evidence type", () => {
    const parsed = masteryEvidenceSchema.safeParse({
      ...baseEvidence,
      evidenceType: "self_report",
      triggerSource: "tutor_tool",
      sourceRefs: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("parses persisted records through parseMasteryEvidence", () => {
    const record = parseMasteryEvidence(baseEvidence);
    expect(record?.id).toBe(baseEvidence.id);
  });

  it("validates evaluator input separately from stored evidence", () => {
    const parsed = masteryEvidenceInputSchema.safeParse({
      tutorQuestion: "Explain photosynthesis.",
      learnerAnswer: "Plants use sunlight.",
      objectiveId: "obj_1",
      conceptRoles: [{ conceptId: "concept_1", role: "primary" }],
      masterySnapshot: { concept_1: 0.4 },
      sourceRefs: [{ refType: "source", refId: "src_1" }],
      referenceAnswer: "Light-dependent reactions convert light to chemical energy.",
    });
    expect(parsed.success).toBe(true);
  });
});
