import {
  learnerTraitEstimateSchema,
  learnerTraitEvidencePacketSchema,
  learnerTraitGuardrailDecisionSchema,
  learnerTraitKeySchema,
  learnerTraitProposalSchema,
  learnerTraitValueByKeySchema,
  learnerTraitTriggerSummarySchema,
  type LearnerTraitEstimate,
  type LearnerTraitGuardrailDecision,
  type LearnerTraitEvidencePacket,
  type LearnerTraitEvidenceRef,
  type LearnerTraitProposal,
  type LearnerTraitSignal,
  type LearnerTraitTriggerSummary,
  type PersonalizationRecommendation,
  personalizationRecommendationSchema,
} from "@studyagent/schemas";
import { appendEvent, type DbClient } from "@studyagent/db";
import {
  readCurrentLearnerTraitEstimates,
  readRecentLearnerTraitSignals,
  upsertCurrentLearnerTraitEstimate,
} from "./learner-trait-store.js";

const EXPLICIT_SOURCES = new Set(["explicit_self_report", "tutor_recorded_preference", "onboarding_profile"]);
const EXPLICIT_CAP = 0.95;
const INFERRED_CAP = 0.72;
const CONTRADICTION_CAP = 0.62;

export type LearnerTraitEstimatorModelConfig = {
  model: string;
  baseUrl: string;
  apiKey: string;
  temperature?: number;
};

export type LearnerTraitEstimatorClient = {
  propose(packet: LearnerTraitEvidencePacket): Promise<LearnerTraitProposal[]>;
};

export function detectLearnerTraitEstimationTrigger(input: {
  signals: LearnerTraitSignal[];
  currentEstimates?: LearnerTraitEstimate[];
  explicitAgentDecision?: boolean;
}): LearnerTraitTriggerSummary {
  const reasons = new Set<LearnerTraitTriggerSummary["reasons"][number]>();
  const evidenceRefs: LearnerTraitEvidenceRef[] = [];
  const traitFamilies = new Set<LearnerTraitSignal["trait"]>();
  const byTrait = new Map<LearnerTraitSignal["trait"], LearnerTraitSignal[]>();

  for (const signal of input.signals) {
    traitFamilies.add(signal.trait);
    byTrait.set(signal.trait, [...(byTrait.get(signal.trait) ?? []), signal]);
    evidenceRefs.push(...signal.evidenceRefs);

    if (EXPLICIT_SOURCES.has(signal.source)) {
      reasons.add("explicit_preference_change");
    }
    if (signal.source === "mastery_evidence_pattern" && (signal.trait === "confidenceStyle" || signal.trait === "metacognitiveAccuracy")) {
      reasons.add("mastery_self_report_contradiction");
    }
    if (signal.source === "tutor_observation" && signal.strength >= 0.65) {
      const observed = byTrait.get(signal.trait) ?? [];
      if (observed.filter((entry) => entry.source === "tutor_observation").length >= 2) {
        reasons.add("repeated_tutor_observed_friction");
      }
    }
    if (signal.trait === "urgencyContext" && signal.suggestedValue) {
      reasons.add("goal_or_urgency_change");
    }
  }

  for (const [trait, signals] of byTrait) {
    if (signals.length >= 2) {
      reasons.add("repeated_trait_family_signals");
      traitFamilies.add(trait);
    }
    const estimate = input.currentEstimates?.find((candidate) => candidate.trait === trait);
    if (estimate && signals.some((signal) => signal.suggestedValue && signal.suggestedValue !== estimate.value && signal.strength >= 0.75)) {
      reasons.add("strong_estimate_contradiction");
    }
  }

  if (input.explicitAgentDecision) {
    reasons.add("explicit_agent_decision");
  }

  return learnerTraitTriggerSummarySchema.parse({
    shouldEstimate: reasons.size > 0,
    reasons: [...reasons],
    evidenceRefs: dedupeEvidenceRefs(evidenceRefs),
    traitFamilies: [...traitFamilies],
  });
}

export function buildLearnerTraitEvidencePacket(input: {
  notebookId: string;
  userId: string;
  trigger: LearnerTraitTriggerSummary;
  signals: LearnerTraitSignal[];
  currentEstimates?: LearnerTraitEstimate[];
  masteryEvidenceSummaries?: Array<{ evidenceRef: LearnerTraitEvidenceRef; summary: string }>;
  profileSummary?: string;
  sessionSummaries?: Array<{ evidenceRef: LearnerTraitEvidenceRef; summary: string }>;
  contradictionRefs?: LearnerTraitEvidenceRef[];
  now?: () => Date;
}): LearnerTraitEvidencePacket {
  const scopedSignals = input.signals.filter((signal) => signal.notebookId === input.notebookId && signal.userId === input.userId);
  const scopedEstimates = (input.currentEstimates ?? []).filter((estimate) => {
    return (!estimate.notebookId || estimate.notebookId === input.notebookId) && (!estimate.userId || estimate.userId === input.userId);
  });
  const packet = {
    packetId: `ltp_${crypto.randomUUID().replaceAll("-", "")}`,
    notebookId: input.notebookId,
    userId: input.userId,
    trigger: input.trigger,
    signals: scopedSignals,
    currentEstimates: scopedEstimates,
    masteryEvidenceSummaries: (input.masteryEvidenceSummaries ?? []).map((entry) => ({
      evidenceRef: entry.evidenceRef,
      summary: truncateSummary(entry.summary),
    })),
    ...(input.profileSummary ? { profileSummary: truncateSummary(input.profileSummary) } : {}),
    sessionSummaries: (input.sessionSummaries ?? []).map((entry) => ({
      evidenceRef: entry.evidenceRef,
      summary: truncateSummary(entry.summary),
    })),
    contradictionRefs: dedupeEvidenceRefs(input.contradictionRefs ?? scopedEstimates.flatMap((estimate) => estimate.contradictionRefs ?? [])),
    builtAt: (input.now ?? (() => new Date()))().toISOString(),
  };

  return learnerTraitEvidencePacketSchema.parse(packet);
}

export function createOpenRouterLearnerTraitEstimatorClient(config: LearnerTraitEstimatorModelConfig): LearnerTraitEstimatorClient {
  return {
    async propose(packet) {
      const base = config.baseUrl.replace(/\/+$/, "");
      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          temperature: config.temperature ?? 0.1,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "Return strict JSON for internal StudyAgent learner trait estimate proposals.",
                "Proposals must be evidence-backed, recommendation-only, and must not mutate mastery, curriculum, artifacts, or source-grounding state.",
                "Return shape: { proposals: [...] }.",
              ].join("\n"),
            },
            {
              role: "user",
              content: JSON.stringify({
                task: "Propose learner trait estimate updates from this bounded evidence packet.",
                packet,
              }),
            },
          ],
        }),
      });
      const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
      if (!response.ok) {
        throw new Error(`Learner trait estimator failed (${response.status}): ${body.error?.message ?? "unknown_error"}`);
      }
      const text = body.choices?.[0]?.message?.content;
      if (!text) throw new Error("Learner trait estimator returned empty content.");
      const raw = JSON.parse(text) as unknown;
      const proposals = typeof raw === "object" && raw !== null && Array.isArray((raw as { proposals?: unknown }).proposals)
        ? (raw as { proposals: unknown[] }).proposals
        : raw;
      const parsed = Array.isArray(proposals) ? proposals : [proposals];
      return parsed.map((proposal, index) => learnerTraitProposalSchema.parse(normalizeLearnerTraitProposal(proposal, packet, index)));
    },
  };
}

function normalizeLearnerTraitProposal(raw: unknown, packet: LearnerTraitEvidencePacket, index: number): unknown {
  if (!isRecord(raw)) return raw;
  const parsedTrait = learnerTraitKeySchema.safeParse(raw.trait);
  const trait = parsedTrait.success ? parsedTrait.data : undefined;
  const value = trait ? normalizeTraitValue(trait, raw.value, packet) : raw.value;
  const matchingSignals = trait ? packet.signals.filter((signal) => signal.trait === trait) : [];
  const explicitSignal = matchingSignals.find((signal) => EXPLICIT_SOURCES.has(signal.source));
  const fallbackEvidenceRefs = matchingSignals.flatMap((signal) => signal.evidenceRefs.length ? signal.evidenceRefs : [{ refType: "trait_signal" as const, refId: signal.id }]);
  const evidenceRefs = Array.isArray(raw.evidenceRefs) && raw.evidenceRefs.length ? raw.evidenceRefs : fallbackEvidenceRefs;
  const updateReason = typeof raw.updateReason === "string" && raw.updateReason.trim()
    ? raw.updateReason
    : typeof raw.rationale === "string" && raw.rationale.trim()
      ? raw.rationale
      : typeof raw.reason === "string" && raw.reason.trim()
        ? raw.reason
        : "Proposed from bounded learner trait evidence.";
  const recommendationText = typeof raw.recommendationText === "string" && raw.recommendationText.trim()
    ? raw.recommendationText
    : typeof raw.recommendation === "string" && raw.recommendation.trim()
      ? raw.recommendation
      : `Use this ${String(trait ?? "trait")} estimate as internal adaptation guidance only.`;

  return {
    ...raw,
    proposalId: typeof raw.proposalId === "string" ? raw.proposalId : `ltprop_${packet.packetId}_${index + 1}`,
    notebookId: typeof raw.notebookId === "string" ? raw.notebookId : packet.notebookId,
    userId: typeof raw.userId === "string" ? raw.userId : packet.userId,
    ...(value !== undefined ? { value } : {}),
    confidence: typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? raw.confidence : strongestSignalConfidence(matchingSignals),
    lane: raw.lane === "explicit" || raw.lane === "inferred" ? raw.lane : explicitSignal ? "explicit" : "inferred",
    evidenceRefs,
    contradictionRefs: Array.isArray(raw.contradictionRefs) ? raw.contradictionRefs : [],
    updateReason,
    recommendationText,
    safetyNotes: Array.isArray(raw.safetyNotes) ? raw.safetyNotes : [],
  };
}

function strongestSignalConfidence(signals: LearnerTraitSignal[]): number {
  const confidence = Math.max(0, ...signals.map((signal) => Math.min(signal.confidence, signal.strength)));
  return confidence > 0 ? Math.min(0.9, confidence) : 0.65;
}

function normalizeTraitValue(trait: LearnerTraitProposal["trait"], value: unknown, packet: LearnerTraitEvidencePacket): unknown {
  const direct = learnerTraitValueByKeySchema.safeParse({ trait, value });
  if (direct.success) return direct.data.value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const aliases: Record<string, string> = {
      slowly: "slow",
      slower: "slow",
      fast_paced: "fast",
      concise: "fast",
      visuals: "visual",
      visual_examples: "visual",
      diagrams: "visual",
      concrete_examples: "concrete",
      real_world: "applied",
      real_world_examples: "applied",
      quizzes: "quiz",
      quiz_questions: "quiz",
      worked_examples: "worked_problem",
      worked_problems: "worked_problem",
      exam: "exam_prep",
      test_prep: "exam_prep",
    };
    const aliased = aliases[normalized] ?? normalized;
    const parsed = learnerTraitValueByKeySchema.safeParse({ trait, value: aliased });
    if (parsed.success) return parsed.data.value;
  }
  const signalValue = packet.signals.find((signal) => signal.trait === trait && signal.suggestedValue !== undefined)?.suggestedValue;
  return signalValue ?? value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function applyLearnerTraitProposalGuardrails(input: {
  proposal: LearnerTraitProposal;
  packet: LearnerTraitEvidencePacket;
  currentEstimates?: LearnerTraitEstimate[];
  now?: () => Date;
}): LearnerTraitGuardrailDecision {
  const now = (input.now ?? (() => new Date()))().toISOString();
  const reasons: string[] = [];
  const proposalEvidenceKeys = new Set(input.proposal.evidenceRefs.map((ref) => `${ref.refType}:${ref.refId}`));
  const packetEvidenceKeys = new Set([
    ...input.packet.signals.flatMap((signal) => signal.evidenceRefs.map((ref) => `${ref.refType}:${ref.refId}`)),
    ...input.packet.signals.map((signal) => `trait_signal:${signal.id}`),
    ...input.packet.masteryEvidenceSummaries.map((entry) => `${entry.evidenceRef.refType}:${entry.evidenceRef.refId}`),
    ...input.packet.sessionSummaries.map((entry) => `${entry.evidenceRef.refType}:${entry.evidenceRef.refId}`),
  ]);
  const missingEvidence = [...proposalEvidenceKeys].filter((key) => !packetEvidenceKeys.has(key));
  const supportingSignals = input.packet.signals.filter((signal) =>
    signal.trait === input.proposal.trait &&
    (proposalEvidenceKeys.has(`trait_signal:${signal.id}`) || signal.evidenceRefs.some((ref) => proposalEvidenceKeys.has(`${ref.refType}:${ref.refId}`))),
  );
  const explicitCurrent = input.currentEstimates?.find((estimate) => estimate.trait === input.proposal.trait && estimate.lane === "explicit");

  if (!input.proposal.evidenceRefs.length) reasons.push("missing evidence refs");
  if (missingEvidence.length) reasons.push("proposal cites evidence outside packet");
  if (input.proposal.lane === "inferred" && supportingSignals.length <= 1 && input.proposal.confidence > 0.55) {
    reasons.push("one-off inferred evidence");
  }
  if (explicitCurrent && input.proposal.lane === "inferred" && explicitCurrent.value !== input.proposal.value) {
    reasons.push("preserve explicit preference over conflicting inferred evidence");
  }

  const cap = Math.min(
    input.proposal.lane === "explicit" ? EXPLICIT_CAP : INFERRED_CAP,
    input.proposal.contradictionRefs.length ? CONTRADICTION_CAP : 1,
    supportingSignals.length <= 1 && input.proposal.lane === "inferred" ? 0.55 : 1,
  );
  const reject = reasons.some((reason) =>
    reason === "missing evidence refs" ||
    reason === "proposal cites evidence outside packet" ||
    reason === "preserve explicit preference over conflicting inferred evidence",
  );

  if (reject) {
    return learnerTraitGuardrailDecisionSchema.parse({
      decisionId: `ltgd_${crypto.randomUUID().replaceAll("-", "")}`,
      proposalId: input.proposal.proposalId,
      notebookId: input.proposal.notebookId,
      userId: input.proposal.userId,
      status: "rejected",
      reasons,
      contradictionRefs: input.proposal.contradictionRefs,
      checkedAt: now,
    });
  }

  const cappedConfidence = Math.min(input.proposal.confidence, cap);
  const status = cappedConfidence < input.proposal.confidence ? "capped" : "accepted";
  if (status === "capped") reasons.push(`confidence capped at ${cappedConfidence.toFixed(2)}`);

  return learnerTraitGuardrailDecisionSchema.parse({
    decisionId: `ltgd_${crypto.randomUUID().replaceAll("-", "")}`,
    proposalId: input.proposal.proposalId,
    notebookId: input.proposal.notebookId,
    userId: input.proposal.userId,
    status,
    reasons: reasons.length ? reasons : ["proposal passed deterministic guardrails"],
    confidenceCap: status === "capped" ? cappedConfidence : undefined,
    contradictionRefs: input.proposal.contradictionRefs,
    acceptedEstimate: {
      id: `lte_${crypto.randomUUID().replaceAll("-", "")}`,
      notebookId: input.proposal.notebookId,
      userId: input.proposal.userId,
      trait: input.proposal.trait,
      value: input.proposal.value,
      confidence: cappedConfidence,
      lane: input.proposal.lane,
      evidenceRefs: input.proposal.evidenceRefs,
      contradictionRefs: input.proposal.contradictionRefs,
      lastUpdatedReason: input.proposal.updateReason,
      guardrail: {
        status,
        reasons: reasons.length ? reasons : ["proposal passed deterministic guardrails"],
        confidenceCap: status === "capped" ? cappedConfidence : null,
        checkedAt: now,
      },
      updatedAt: now,
    },
    checkedAt: now,
  });
}

export function derivePersonalizationRecommendations(input: {
  notebookId: string;
  userId: string;
  estimates: LearnerTraitEstimate[];
}): PersonalizationRecommendation[] {
  const parsed = input.estimates.map((estimate) => learnerTraitEstimateSchema.parse(estimate));
  return parsed.flatMap((estimate) => {
    const recommendation = recommendationForEstimate(estimate);
    if (!recommendation) return [];
    return [personalizationRecommendationSchema.parse({
      id: `ltr_${estimate.trait}`,
      notebookId: input.notebookId,
      userId: input.userId,
      trait: estimate.trait,
      lane: estimate.lane,
      recommendation: recommendation.text,
      adaptationType: recommendation.type,
      learnerFacingSafe: true,
      includeRawLabel: false,
      evidenceRefs: estimate.evidenceRefs,
    })];
  }).slice(0, 6);
}

export async function loadPersonalizationRecommendationsForTutorContext(
  dbClient: DbClient,
  input: { notebookId: string; userId: string },
): Promise<PersonalizationRecommendation[]> {
  const estimates = await readCurrentLearnerTraitEstimates(dbClient, input);
  return derivePersonalizationRecommendations({ ...input, estimates });
}

export async function runLearnerTraitEstimationCycle(input: {
  dbClient: DbClient;
  notebookId: string;
  userId: string;
  sessionId?: string;
  estimator: LearnerTraitEstimatorClient;
  explicitAgentDecision?: boolean;
}): Promise<{
  trigger: LearnerTraitTriggerSummary;
  packet?: LearnerTraitEvidencePacket;
  proposals: LearnerTraitProposal[];
  guardrailDecisions: LearnerTraitGuardrailDecision[];
  persistedEstimateIds: string[];
}> {
  const [signals, currentEstimates] = await Promise.all([
    readRecentLearnerTraitSignals(input.dbClient, {
      notebookId: input.notebookId,
      userId: input.userId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      limit: 50,
    }),
    readCurrentLearnerTraitEstimates(input.dbClient, {
      notebookId: input.notebookId,
      userId: input.userId,
    }),
  ]);
  const trigger = detectLearnerTraitEstimationTrigger({
    signals,
    currentEstimates,
    ...(input.explicitAgentDecision !== undefined ? { explicitAgentDecision: input.explicitAgentDecision } : {}),
  });

  if (!trigger.shouldEstimate) {
    await appendEvent(input.dbClient, {
      notebookId: input.notebookId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      eventType: "learner_trait.estimation.skipped",
      payload: { trigger },
    });
    return { trigger, proposals: [], guardrailDecisions: [], persistedEstimateIds: [] };
  }

  const packet = buildLearnerTraitEvidencePacket({
    notebookId: input.notebookId,
    userId: input.userId,
    trigger,
    signals,
    currentEstimates,
  });
  let proposals: LearnerTraitProposal[] = [];
  try {
    proposals = await input.estimator.propose(packet);
  } catch (error) {
    await appendEvent(input.dbClient, {
      notebookId: input.notebookId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      eventType: "learner_trait.estimator.failed",
      payload: { packetId: packet.packetId, message: error instanceof Error ? error.message : String(error) },
    });
    return { trigger, packet, proposals: [], guardrailDecisions: [], persistedEstimateIds: [] };
  }

  const guardrailDecisions = proposals.map((proposal) =>
    applyLearnerTraitProposalGuardrails({ proposal, packet, currentEstimates }),
  );
  const persistedEstimateIds: string[] = [];
  for (const decision of guardrailDecisions) {
    if (decision.acceptedEstimate) {
      const estimate = await upsertCurrentLearnerTraitEstimate(input.dbClient, {
        ...decision.acceptedEstimate,
        notebookId: input.notebookId,
        userId: input.userId,
      });
      if (estimate.id) persistedEstimateIds.push(estimate.id);
    }
    await appendEvent(input.dbClient, {
      notebookId: input.notebookId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      eventType: "learner_trait.guardrail_decision.recorded",
      payload: {
        decisionId: decision.decisionId,
        proposalId: decision.proposalId,
        status: decision.status,
        reasons: decision.reasons,
        acceptedEstimateId: decision.acceptedEstimate?.id ?? null,
      },
    });
  }

  return { trigger, packet, proposals, guardrailDecisions, persistedEstimateIds };
}

function truncateSummary(value: string, maxLength = 600): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function dedupeEvidenceRefs(refs: LearnerTraitEvidenceRef[]): LearnerTraitEvidenceRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.refType}:${ref.refId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function recommendationForEstimate(estimate: ReturnType<typeof learnerTraitEstimateSchema.parse>): { type: PersonalizationRecommendation["adaptationType"]; text: string } | null {
  switch (estimate.trait) {
    case "pacePreference":
      if (estimate.value === "slow") return { type: "pace", text: "Use smaller steps and pause for checkpoints before advancing." };
      if (estimate.value === "fast") return { type: "pace", text: "Keep explanations concise and offer acceleration only when mastery evidence supports it." };
      return { type: "pace", text: "Use a balanced pace with brief checks for understanding." };
    case "depthPreference":
      if (estimate.value === "formal") return { type: "depth", text: "Include precise definitions and formal reasoning when explaining." };
      if (estimate.value === "intuitive") return { type: "depth", text: "Start with intuition before moving to formal details." };
      return { type: "depth", text: "Balance intuition with enough formal structure to stay source-grounded." };
    case "examplePreference":
      return { type: "examples", text: `Prefer ${estimate.value.replaceAll("_", " ")} examples when teaching new ideas.` };
    case "assessmentPreference":
      return { type: "assessment", text: `Check understanding with ${estimate.value.replaceAll("_", " ")} style practice.` };
    case "confidenceStyle":
      if (estimate.value === "underconfident") return { type: "confidence_support", text: "Use evidence-backed encouragement and avoid unnecessary remediation when answers are strong." };
      if (estimate.value === "overconfident") return { type: "confidence_support", text: "Verify understanding with short checks before advancing from self-reported confidence." };
      return { type: "confidence_support", text: "Use normal confidence calibration and connect feedback to evidence." };
    case "helpSeekingStyle":
      if (estimate.value === "avoids_help") return { type: "help_seeking", text: "Offer low-friction hints and checkpoints without waiting for the learner to ask." };
      if (estimate.value === "asks_early") return { type: "help_seeking", text: "Answer clarifying questions directly, then return to the current objective." };
      return { type: "help_seeking", text: "Let the learner try first, then provide targeted feedback." };
    case "sourceFamiliarity":
      if (estimate.value === "unfamiliar") return { type: "source_grounding", text: "Introduce source terms gently and ground answers in visible source references." };
      return { type: "source_grounding", text: "Use source-grounded explanations without over-explaining familiar context." };
    case "urgencyContext":
      if (estimate.value === "exam_prep" || estimate.value === "deadline_pressure") return { type: "urgency", text: "Prioritize high-yield practice, concise summaries, and concrete next actions." };
      return { type: "urgency", text: "Keep the session exploratory while maintaining the current learning path." };
    default:
      return null;
  }
}
