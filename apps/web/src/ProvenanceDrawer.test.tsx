import { describe, expect, it } from "vitest";
import type { EvidenceRef } from "@studyagent/schemas";
import { isDeveloperClaim, isEvidenceChunk, isLearnerCanonicalClaim } from "./ProvenanceDrawer.js";

const learnerChunk: EvidenceRef = {
  id: "chunk_1",
  kind: "chunk",
  visibility: "learner",
  label: "Source excerpt",
  text: "Heat transfers by contact.",
  confidence: null,
  status: null,
  chunkType: "paragraph",
  pageStart: 1,
  pageEnd: 1,
  sourceId: "src_1",
  sourceTitle: "Source One",
  metadata: {},
};

const learnerClaim: EvidenceRef = {
  id: "claim_1",
  kind: "claim",
  visibility: "learner",
  label: "Supporting note",
  text: "Accepted claim text.",
  confidence: 0.9,
  status: "accepted",
  statementKind: "source_backed",
  chunkType: null,
  pageStart: null,
  pageEnd: null,
  sourceId: null,
  sourceTitle: null,
  metadata: {},
};

const developerClaim: EvidenceRef = {
  id: "claim_2",
  kind: "claim",
  visibility: "developer",
  label: "Draft claim",
  text: "Hidden low-confidence claim.",
  confidence: 0.2,
  status: "candidate",
  statementKind: "generated",
  chunkType: null,
  pageStart: null,
  pageEnd: null,
  sourceId: null,
  sourceTitle: null,
  metadata: {},
};

const sanitizedLearnerClaim: EvidenceRef = {
  ...learnerClaim,
  confidence: null,
  status: null,
};

describe("ProvenanceDrawer evidence filters", () => {
  it("keeps learner chunks and canonical claims separate from developer claims", () => {
    expect(isEvidenceChunk(learnerChunk)).toBe(true);
    expect(isLearnerCanonicalClaim(learnerClaim)).toBe(true);
    expect(isLearnerCanonicalClaim(sanitizedLearnerClaim)).toBe(true);
    expect(isDeveloperClaim(developerClaim)).toBe(true);
    expect(isLearnerCanonicalClaim(developerClaim)).toBe(false);
  });
});
