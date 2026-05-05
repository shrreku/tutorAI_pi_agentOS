import { confidenceComponentsSchema, type ConfidenceComponents } from "@studyagent/schemas";

export type { ConfidenceComponents };

export { confidenceComponentsSchema };

/** Map reinforcement count to a 0–1 signal for the confidence model (GF-0401 / GF-0405). */
export function reinforcementSignalFromCount(count: number): number {
  const n = Math.max(0, count);
  return Math.min(1, n / (n + 6));
}

export function combineConfidence(components: ConfidenceComponents): number {
  const parsed = confidenceComponentsSchema.safeParse(components);
  const c = parsed.success ? parsed.data : components;
  const score =
    c.sourceSupport * 0.32 +
    c.extractionConfidence * 0.22 +
    c.recency * 0.1 +
    c.humanApproval * 0.22 +
    c.reinforcementSignal * 0.09 -
    c.contradictionPenalty;

  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

export function buildPageConfidenceSummary(input: {
  claimConfidences: number[];
  claimComponentSamples?: ConfidenceComponents[];
}): Record<string, unknown> {
  const { claimConfidences, claimComponentSamples = [] } = input;
  const n = claimConfidences.length;
  const avg = n ? claimConfidences.reduce((a, b) => a + b, 0) / n : 0;
  const explain: Record<string, number> = {};
  if (claimComponentSamples.length) {
    const keys = [
      "sourceSupport",
      "extractionConfidence",
      "recency",
      "humanApproval",
      "reinforcementSignal",
      "contradictionPenalty",
    ] as const;
    for (const k of keys) {
      const vals = claimComponentSamples.map((s) => s[k]).filter((x) => typeof x === "number");
      if (vals.length) {
        explain[k] = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4));
      }
    }
  }
  return {
    model: "studyagent_confidence_v2",
    claimCount: n,
    meanClaimConfidence: Number(avg.toFixed(4)),
    meanComponents: explain,
  };
}
