import type { ConfidenceComponents } from "./confidence.js";
import type { HumanBlock } from "./page-blocks.js";

export type WikiBlockOrigin = "generated" | "human";

export type WikiPageBlock = {
  origin: WikiBlockOrigin;
  id?: string;
  markdown: string;
};

export type WikiChangeSetConcept = {
  id: string;
  canonicalName: string;
  aliases: string[];
  conceptType: string;
  action: "create" | "update";
};

export type WikiChangeSetClaimLink = {
  conceptId: string;
  role: string;
  confidence: number;
};

export type ClaimResolutionDecision =
  | { kind: "active"; reason: string }
  | { kind: "superseded"; winnerId: string; reason: string }
  | { kind: "contradicted"; pairedClaimId: string; reason: string }
  | { kind: "low_confidence"; reason: string };

export type WikiChangeSetClaim = {
  id: string;
  claimText: string;
  claimType: string;
  conceptIds: string[];
  conceptLinks: WikiChangeSetClaimLink[];
  evidenceChunkIds: string[];
  status: string;
  confidence: number;
  qualityScore: number;
  supportScore: number;
  confidenceComponents: ConfidenceComponents;
  resolution: ClaimResolutionDecision;
  evidenceRefs: Array<{ kind: "source_chunk"; chunkId: string }>;
};

export type WikiChangeSetClaimPatch = {
  claimId: string;
  status: string;
  supersededByClaimId?: string;
  confidence: number;
  qualityScore: number;
  confidenceComponents: ConfidenceComponents;
  resolution: ClaimResolutionDecision;
};

export type WikiChangeSetWikiPage = {
  id: string;
  pageType: "concept" | "source_summary" | "topic";
  pageKey: string;
  title: string;
  markdown: string;
  blocks: WikiPageBlock[];
  sourceClaimIds: string[];
  sourceChunkIds: string[];
  structuredJson: Record<string, unknown>;
  confidenceSummaryJson: Record<string, unknown>;
  qualityScore: number;
};

export type WikiChangeSetGraphRelation = {
  id: string;
  sourceNodeType: "concept" | "claim";
  sourceNodeId: string;
  targetNodeType: "concept" | "claim";
  targetNodeId: string;
  relationType: string;
  confidence: number;
  sourceClaimIds: string[];
  sourceChunkIds: string[];
  metadataJson: Record<string, unknown>;
};

export type WikiChangeSetWarning = {
  code: string;
  message: string;
  severity: "info" | "warn" | "error";
  context?: Record<string, unknown>;
};

export type WikiChangeSetEvent = {
  eventType: string;
  payload: Record<string, unknown>;
};

export type WikiChangeSet = {
  notebookId: string;
  sourceId: string;
  sourceVersionId: string;
  sourceTitle: string;
  compiledAt: string;
  fingerprint: string;
  concepts: WikiChangeSetConcept[];
  claims: WikiChangeSetClaim[];
  claimPatches: WikiChangeSetClaimPatch[];
  graphRelations: WikiChangeSetGraphRelation[];
  wikiPages: WikiChangeSetWikiPage[];
  deleteWikiPageKeys: string[];
  deleteClaimsForSource: boolean;
  deleteGraphRelationsForSource: boolean;
  warnings: WikiChangeSetWarning[];
  events: WikiChangeSetEvent[];
};

export type WikiCompilationFailure = {
  ok: false;
  reasons: WikiChangeSetWarning[];
};

export type WikiCompilationSuccess = {
  ok: true;
  changeSet: WikiChangeSet;
};

export type WikiCompilationResult = WikiCompilationSuccess | WikiCompilationFailure;

export type PriorWikiPage = {
  pageKey: string;
  pageType: string;
  markdown: string;
};

export type PreservedHumanBlocksByPageKey = Map<string, HumanBlock[]>;
