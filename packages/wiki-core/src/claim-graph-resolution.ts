import { combineConfidence, type ConfidenceComponents } from "./confidence.js";
import {
  type ClaimLite,
  normalizeClaimText,
  pickContradictionClaimPairs,
  planCrossSourceSupersessions,
} from "./claim-resolver.js";
import type {
  ClaimResolutionDecision,
  WikiChangeSetClaim,
  WikiChangeSetClaimPatch,
  WikiChangeSetGraphRelation,
  WikiChangeSetWarning,
} from "./wiki-change-set.js";

const LOW_CONFIDENCE_THRESHOLD = 0.42;
const DUPLICATE_NORMALIZED_WARNING = "duplicate_normalized_claim";

export type RawExtractedClaim = {
  id: string;
  claimText: string;
  claimType: string;
  conceptIds: string[];
  evidenceChunkIds: string[];
  confidenceComponents: ConfidenceComponents;
};

export type ExistingNotebookClaim = {
  id: string;
  sourceId: string;
  claimText: string;
  createdAtMs: number;
  status: string;
};

export type ConceptContradictionEdge = {
  fromConceptId: string;
  toConceptId: string;
};

export type ResolvedClaimGraph = {
  claims: WikiChangeSetClaim[];
  claimPatches: WikiChangeSetClaimPatch[];
  graphRelations: WikiChangeSetGraphRelation[];
  warnings: WikiChangeSetWarning[];
  events: Array<{ eventType: string; payload: Record<string, unknown> }>;
};

export type ResolveClaimGraphInput = {
  notebookId: string;
  sourceId: string;
  ingestionSourceId: string;
  nowMs: number;
  newClaims: RawExtractedClaim[];
  existingClaims: ExistingNotebookClaim[];
  contradictionEdges: ConceptContradictionEdge[];
  nextRelationId: () => string;
};

function claimLiteFromRaw(claim: RawExtractedClaim, sourceId: string, createdAtMs: number): ClaimLite {
  return {
    id: claim.id,
    sourceId,
    normalized: normalizeClaimText(claim.claimText),
    createdAtMs,
  };
}

function detectDuplicateNormalizedWarnings(newClaims: RawExtractedClaim[]): WikiChangeSetWarning[] {
  const byNorm = new Map<string, string[]>();
  for (const claim of newClaims) {
    const norm = normalizeClaimText(claim.claimText);
    const ids = byNorm.get(norm) ?? [];
    ids.push(claim.id);
    byNorm.set(norm, ids);
  }
  const warnings: WikiChangeSetWarning[] = [];
  for (const [norm, ids] of byNorm) {
    if (ids.length < 2) continue;
    warnings.push({
      code: DUPLICATE_NORMALIZED_WARNING,
      message: "Multiple new claims share the same normalized text; keeping all as candidates.",
      severity: "warn",
      context: { normalized: norm, claimIds: ids },
    });
  }
  return warnings;
}

function markLowConfidenceClaims(claims: WikiChangeSetClaim[]): WikiChangeSetWarning[] {
  const warnings: WikiChangeSetWarning[] = [];
  for (const claim of claims) {
    if (claim.confidence >= LOW_CONFIDENCE_THRESHOLD) continue;
    claim.resolution = {
      kind: "low_confidence",
      reason: `confidence_below_${LOW_CONFIDENCE_THRESHOLD}`,
    };
    warnings.push({
      code: "claim.low_confidence",
      message: "Claim confidence is below the tutoring-ready threshold.",
      severity: "warn",
      context: { claimId: claim.id, confidence: claim.confidence },
    });
  }
  return warnings;
}

export function resolveClaimGraph(input: ResolveClaimGraphInput): ResolvedClaimGraph {
  const warnings: WikiChangeSetWarning[] = detectDuplicateNormalizedWarnings(input.newClaims);
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];

  const claims: WikiChangeSetClaim[] = input.newClaims.map((raw) => {
    const confidence = combineConfidence(raw.confidenceComponents);
    return {
      id: raw.id,
      claimText: raw.claimText,
      claimType: raw.claimType,
      conceptIds: raw.conceptIds,
      conceptLinks: raw.conceptIds.map((conceptId) => ({
        conceptId,
        role: "subject",
        confidence,
      })),
      evidenceChunkIds: raw.evidenceChunkIds,
      status: "candidate",
      confidence,
      qualityScore: confidence,
      supportScore: raw.confidenceComponents.sourceSupport,
      confidenceComponents: raw.confidenceComponents,
      resolution: { kind: "active", reason: "newly_extracted" },
      evidenceRefs: raw.evidenceChunkIds.map((chunkId) => ({ kind: "source_chunk" as const, chunkId })),
    };
  });

  warnings.push(...markLowConfidenceClaims(claims));

  const excludedStatuses = new Set(["superseded", "deprecated", "archived"]);
  const existingLites: ClaimLite[] = input.existingClaims
    .filter((c) => !excludedStatuses.has(c.status))
    .map((c) => ({
      id: c.id,
      sourceId: c.sourceId,
      normalized: normalizeClaimText(c.claimText),
      createdAtMs: c.createdAtMs,
    }));

  const newLites = input.newClaims.map((raw) => claimLiteFromRaw(raw, input.sourceId, input.nowMs));
  const supersedePlans = planCrossSourceSupersessions(newLites, existingLites);

  const claimPatches: WikiChangeSetClaimPatch[] = [];
  const graphRelations: WikiChangeSetGraphRelation[] = [];

  for (const plan of supersedePlans) {
    const existing = input.existingClaims.find((c) => c.id === plan.olderId);
    if (!existing) continue;
    claimPatches.push({
      claimId: plan.olderId,
      status: "superseded",
      supersededByClaimId: plan.winnerId,
      confidence: 0.35,
      qualityScore: 0.35,
      confidenceComponents: {
        sourceSupport: 0.4,
        extractionConfidence: 0.4,
        recency: 0.5,
        contradictionPenalty: 0,
        humanApproval: 0,
        reinforcementSignal: 0,
      },
      resolution: {
        kind: "superseded",
        winnerId: plan.winnerId,
        reason: "cross_source_duplicate",
      },
    });
    graphRelations.push({
      id: input.nextRelationId(),
      sourceNodeType: "claim",
      sourceNodeId: plan.winnerId,
      targetNodeType: "claim",
      targetNodeId: plan.olderId,
      relationType: "supersedes",
      confidence: 0.9,
      sourceClaimIds: [plan.winnerId, plan.olderId],
      sourceChunkIds: [],
      metadataJson: { wikiLifecycle: "supersedes", ingestionSourceId: input.ingestionSourceId },
    });
    events.push({
      eventType: "wiki.claim.superseded",
      payload: { loserClaimId: plan.olderId, winnerClaimId: plan.winnerId },
    });
  }

  const contradictionPairs = pickContradictionClaimPairs({
    relations: input.contradictionEdges.map((edge) => ({
      fromConceptId: edge.fromConceptId,
      toConceptId: edge.toConceptId,
      relationType: "contradicts",
    })),
    claims: input.newClaims.map((c) => ({ id: c.id, conceptIds: c.conceptIds })),
  });

  for (const pair of contradictionPairs) {
    graphRelations.push({
      id: input.nextRelationId(),
      sourceNodeType: "claim",
      sourceNodeId: pair.a,
      targetNodeType: "claim",
      targetNodeId: pair.b,
      relationType: "contradicts",
      confidence: 0.65,
      sourceClaimIds: [pair.a, pair.b],
      sourceChunkIds: [],
      metadataJson: { wikiLifecycle: "claim_contradiction", ingestionSourceId: input.ingestionSourceId },
    });
    events.push({
      eventType: "wiki.claim.contradicted",
      payload: { claimIds: [pair.a, pair.b] },
    });

    for (const claimId of [pair.a, pair.b]) {
      const claim = claims.find((c) => c.id === claimId);
      if (!claim || claim.status === "superseded") continue;
      const prev = claim.confidenceComponents;
      const components: ConfidenceComponents = {
        sourceSupport: prev.sourceSupport,
        extractionConfidence: prev.extractionConfidence,
        recency: prev.recency,
        humanApproval: prev.humanApproval,
        reinforcementSignal: prev.reinforcementSignal,
        contradictionPenalty: Math.min(1, prev.contradictionPenalty + 0.35),
      };
      const confidence = combineConfidence(components);
      claim.status = "contradicted";
      claim.confidence = confidence;
      claim.qualityScore = confidence;
      claim.confidenceComponents = components;
      claim.resolution = {
        kind: "contradicted",
        pairedClaimId: claimId === pair.a ? pair.b : pair.a,
        reason: "concept_level_contradiction",
      };
      warnings.push({
        code: "claim.contradiction_resolved",
        message: "Claim marked contradicted from concept-level contradicts relation.",
        severity: "warn",
        context: { claimId, pairedClaimId: claim.resolution.kind === "contradicted" ? claim.resolution.pairedClaimId : undefined },
      });
    }
  }

  if (supersedePlans.length === 0 && contradictionPairs.length === 0 && warnings.some((w) => w.severity === "error")) {
    warnings.push({
      code: "claim.resolution_degraded",
      message: "Claim graph resolution completed with errors only.",
      severity: "warn",
    });
  }

  return { claims, claimPatches, graphRelations, warnings, events };
}
