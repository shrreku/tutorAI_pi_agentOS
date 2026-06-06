import type { LearnerTraitKey, LearnerTraitSignal } from "@studyagent/schemas";

export type MasteryEvidenceRowForTraitPatterns = {
  id: string;
  turnId: string | null;
  sessionId: string | null;
  evidenceJson: Record<string, unknown>;
};

export function deriveMasteryEvidencePatternSignals(input: {
  notebookId: string;
  userId: string;
  masteryRows: MasteryEvidenceRowForTraitPatterns[];
  now?: () => Date;
}): LearnerTraitSignal[] {
  const observedAt = (input.now ?? (() => new Date()))().toISOString();
  const signals: LearnerTraitSignal[] = [];

  for (const row of input.masteryRows) {
    const evidence = row.evidenceJson;
    const evidenceType = typeof evidence.evidenceType === "string" ? evidence.evidenceType : null;
    const correctnessLabel = typeof evidence.correctnessLabel === "string" ? evidence.correctnessLabel : null;
    const confidence = typeof evidence.confidence === "number" ? evidence.confidence : null;
    if (evidenceType !== "self_report") continue;

    const evidenceRef = {
      refType: "mastery_evidence" as const,
      refId: row.id,
      ...(row.turnId ? { summary: `turn ${row.turnId}` } : {}),
    };

    if (
      (correctnessLabel === "incorrect" || correctnessLabel === "partial") &&
      confidence !== null &&
      confidence >= 0.65
    ) {
      signals.push(
        buildPatternSignal({
          notebookId: input.notebookId,
          userId: input.userId,
          trait: "confidenceStyle",
          suggestedValue: "overconfident",
          evidenceRef,
          sessionId: row.sessionId,
          turnId: row.turnId,
          observedAt,
          notes: "Mastery evidence shows confident self-report contradicted by answer quality.",
        }),
        buildPatternSignal({
          notebookId: input.notebookId,
          userId: input.userId,
          trait: "metacognitiveAccuracy",
          suggestedValue: "low",
          evidenceRef,
          sessionId: row.sessionId,
          turnId: row.turnId,
          observedAt,
          notes: "Mastery evidence shows low metacognitive accuracy for self-reported confidence.",
        }),
      );
      continue;
    }

    if (correctnessLabel === "correct" && confidence !== null && confidence <= 0.45) {
      signals.push(
        buildPatternSignal({
          notebookId: input.notebookId,
          userId: input.userId,
          trait: "confidenceStyle",
          suggestedValue: "underconfident",
          evidenceRef,
          sessionId: row.sessionId,
          turnId: row.turnId,
          observedAt,
          notes: "Mastery evidence shows underconfident self-report despite a strong answer.",
        }),
      );
    }
  }

  return dedupePatternSignals(signals);
}

function buildPatternSignal(input: {
  notebookId: string;
  userId: string;
  trait: LearnerTraitKey;
  suggestedValue: string;
  evidenceRef: { refType: "mastery_evidence"; refId: string; summary?: string };
  sessionId: string | null;
  turnId: string | null;
  observedAt: string;
  notes: string;
}): LearnerTraitSignal {
  return {
    id: `lts_mevpat_${input.evidenceRef.refId}_${input.trait}`,
    notebookId: input.notebookId,
    userId: input.userId,
    source: "mastery_evidence_pattern",
    trait: input.trait,
    suggestedValue: input.suggestedValue,
    strength: 0.72,
    confidence: 0.68,
    evidenceRefs: [input.evidenceRef],
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.turnId ? { turnId: input.turnId } : {}),
    internalVisibility: true,
    observedAt: input.observedAt,
    notes: input.notes,
  } as LearnerTraitSignal;
}

function dedupePatternSignals(signals: LearnerTraitSignal[]): LearnerTraitSignal[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.trait}:${signal.evidenceRefs[0]?.refId ?? signal.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
