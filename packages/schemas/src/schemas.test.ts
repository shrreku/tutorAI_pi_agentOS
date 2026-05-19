import { describe, expect, it } from "vitest";
import {
  artifactSchema,
  artifactTypeSchema,
  buildConceptLearnerReadiness,
  evidenceReadModelSchema,
  eventEnvelopeSchema,
  graphNodeSchema,
  inferSourceLevelFromSignals,
  learnerFacingSurfaceStatus,
  learnerReadinessSchema,
  nodeRefSchema,
  notebookSearchResponseSchema,
  parseReducerResult,
  referenceSurfaceSchema,
  quizArtifactPayloadSchema,
  sourceLevelSchema,
  sourceScopePolicySchema,
  sourceSchema,
  workspaceGraphReadModelSchema,
} from "./index.js";

describe("shared schemas", () => {
  it("validates event envelopes", () => {
    const parsed = eventEnvelopeSchema.parse({
      id: "evt_1",
      notebookId: "nb_1",
      eventType: "source.uploaded",
      sequenceNo: 1,
      createdAt: "2026-05-04T00:00:00.000Z",
      payload: { sourceId: "src_1" },
    });

    expect(parsed.eventType).toBe("source.uploaded");
  });

  it("parses notebook search responses", () => {
    const parsed = notebookSearchResponseSchema.parse({
      mode: "hybrid",
      query: "entropy",
      hits: [
        {
          id: "chk_1",
          type: "chunk",
          title: "Chunk",
          snippet: "Entropy is…",
          score: 0.04,
          scoreDetails: { lexical: 0.1, rrf: 0.02 },
          provenance: [{ refType: "chunk", refId: "chk_1", role: "derived_from" }],
          scoreExplanation: "RRF 0.0200 · lexical 0.100",
          sourceRefs: [{ sourceId: "src_1", sourceVersionId: "sv_1" }],
        },
      ],
    });
    expect(parsed.hits[0]!.type).toBe("chunk");
    expect(parsed.hits[0]!.scoreExplanation).toContain("RRF");
  });

  it("keeps source status explicit for tutoring readiness", () => {
    const parsed = sourceSchema.parse({
      id: "src_1",
      notebookId: "nb_1",
      title: "Linear Algebra Notes",
      sourceType: "pdf",
      originalObjectKey: "sources/src_1/original.pdf",
      status: "tutoring_ready",
      createdAt: "2026-05-04T00:00:00.000Z",
      updatedAt: "2026-05-04T00:00:00.000Z",
    });

    expect(parsed.metadata).toEqual({});
  });

  it("accepts proposed learner-visible artifact lifecycle status", () => {
    const parsed = artifactSchema.parse({
      id: "artifact_1",
      notebookId: "nb_1",
      artifactType: "worked_example",
      title: "Worked example draft",
      status: "proposed",
      payload: {},
      sourceNodeRefs: [],
      provenance: [],
      createdAt: "2026-05-04T00:00:00.000Z",
      updatedAt: "2026-05-04T00:00:00.000Z",
    });

    expect(parsed.status).toBe("proposed");
  });

  it("accepts draft quiz payloads with resumable generation state", () => {
    const parsed = quizArtifactPayloadSchema.parse({
      questions: [],
      generationState: {
        status: "draft",
        prompt: "Build a five-question quiz about conduction.",
        requestedQuestionCount: 5,
        generatedQuestionCount: 0,
        conceptIds: ["concept_1"],
        sourceNodeRefs: [{ refType: "chunk", refId: "chunk_1" }],
      },
    });

    expect(parsed.questions).toEqual([]);
    expect(parsed.generationState?.status).toBe("draft");
  });

  it("parses reducer results through the shared schema helper", () => {
    expect(
      parseReducerResult({
        accepted: true,
        mutationType: "artifact.created",
        appliedChanges: { title: "Notes" },
        emittedEventIds: ["evt_1"],
      }),
    ).toEqual({
      accepted: true,
      mutationType: "artifact.created",
      appliedChanges: { title: "Notes" },
      emittedEventIds: ["evt_1"],
    });

    expect(parseReducerResult({ accepted: true, appliedChanges: {}, emittedEventIds: [] })).toBeUndefined();
  });

  it("accepts runtime context selection failure events", () => {
    const parsed = eventEnvelopeSchema.parse({
      id: "evt_ctx_1",
      notebookId: "nb_1",
      eventType: "session.context.selection_failed",
      sequenceNo: 9,
      createdAt: "2026-05-06T00:00:00.000Z",
      payload: { message: "timeout" },
    });
    expect(parsed.eventType).toBe("session.context.selection_failed");
  });

  it("accepts extended whiteboard node ref types", () => {
    const refs = [
      { refType: "source_section", refId: "ss_1" },
      { refType: "topic", refId: "topic_1" },
      { refType: "curriculum_module", refId: "mod_1" },
      { refType: "objective_list", refId: "ol_1" },
      { refType: "session_plan", refId: "sp_1" },
      { refType: "coverage_item", refId: "ci_1" },
      { refType: "coverage_record", refId: "cr_1" },
      { refType: "weak_concept", refId: "wc_1" },
    ] as const;
    for (const ref of refs) {
      expect(nodeRefSchema.parse(ref)).toEqual(ref);
    }
  });

  it("keeps Live Plan as an entity ref but not an artifact type", () => {
    expect(nodeRefSchema.parse({ refType: "study_plan", refId: "plan_1" })).toEqual({ refType: "study_plan", refId: "plan_1" });
    expect(artifactTypeSchema.safeParse("study_plan").success).toBe(false);
  });

  it("accepts topic as a graph node type", () => {
    const parsed = graphNodeSchema.parse({
      id: "topic_1",
      notebookId: "nb_1",
      nodeType: "topic",
      ref: { refType: "topic", refId: "topic_1" },
      title: "Probability",
    });

    expect(parsed.nodeType).toBe("topic");
  });

  it("validates reference surfaces for learner-visible nodes", () => {
    const parsed = referenceSurfaceSchema.parse({
      id: "surface_1",
      notebookId: "nb_1",
      nodeRef: { refType: "concept", refId: "concept_1" },
      title: "Conduction",
      surfaceType: "concept",
      summary: "Heat transfer through matter.",
      status: "published",
      blocks: [
        {
          id: "definition",
          kind: "definition",
          title: "Definition",
          content: "Conduction transfers heat by molecular interaction.",
          evidenceRefs: [
            {
              id: "claim_1",
              kind: "claim",
              visibility: "learner",
              label: "Supporting claim",
              text: "Conduction transfers heat by molecular interaction.",
              confidence: 0.92,
              status: "accepted",
              statementKind: "source_backed",
              chunkType: null,
              pageStart: null,
              pageEnd: null,
              sourceId: null,
              sourceTitle: null,
              metadata: {},
            },
          ],
        },
      ],
      sourceRefs: [{ refType: "chunk", refId: "chunk_1" }],
      provenanceRefs: [{ refType: "chunk", refId: "chunk_1", role: "derived_from" }],
      primaryActions: ["ask_tutor", "open_provenance"],
      quality: { confidence: 0.82, sourceBacked: true, needsReview: false },
    });

    expect(parsed.surfaceType).toBe("concept");
    expect(parsed.blocks[0]!.kind).toBe("definition");
  });

  it("validates shared evidence read models", () => {
    const parsed = evidenceReadModelSchema.parse({
      nodeId: "concept_1",
      entityType: "concept",
      entity: { title: "Conduction" },
      learnerRefs: [
        {
          id: "chunk_1",
          kind: "chunk",
          visibility: "learner",
          label: "Source excerpt",
          text: "Heat transfers through direct molecular contact.",
          confidence: 0.8,
          status: "accepted",
          chunkType: "paragraph",
          pageStart: 1,
          pageEnd: 1,
          sourceId: "src_1",
          sourceTitle: "Source One",
          metadata: {},
        },
      ],
      developerRefs: [
        {
          id: "claim_2",
          kind: "claim",
          visibility: "developer",
          label: "Draft claim",
          text: "Potentially useful but not yet learner-safe.",
          confidence: 0.3,
          status: "candidate",
          statementKind: "generated",
          chunkType: null,
          pageStart: null,
          pageEnd: null,
          sourceId: null,
          sourceTitle: null,
          metadata: { reason: "low confidence" },
        },
      ],
    });

    expect(parsed.learnerRefs).toHaveLength(1);
    expect(parsed.developerRefs[0]?.visibility).toBe("developer");
  });

  it("maps artifact lifecycle status to learner-facing labels", () => {
    expect(
      learnerFacingSurfaceStatus({
        surfaceType: "artifact",
        status: "ready",
        quality: { confidence: 0.9, sourceBacked: true, needsReview: false },
      }),
    ).toBe("Ready to study");
    expect(
      learnerFacingSurfaceStatus({
        surfaceType: "artifact",
        status: "draft",
        quality: { confidence: null, sourceBacked: false, needsReview: true },
      }),
    ).toBeNull();
  });

  it("validates source and learner level contracts", () => {
    expect(sourceLevelSchema.parse("undergraduate")).toBe("undergraduate");
    expect(sourceScopePolicySchema.parse("strict_source_scope")).toBe("strict_source_scope");
    expect(inferSourceLevelFromSignals({ title: "High school physics workbook" }).level).toBe("high_school");
    expect(
      learnerReadinessSchema.parse(
        buildConceptLearnerReadiness({ conceptId: "concept_1", masteryScore: 0.5, confidence: 0.7 }),
      ).readiness,
    ).toBe("developing");
  });

  it("validates workspace graph read models", () => {
    const parsed = workspaceGraphReadModelSchema.parse({
      viewMode: "study_map",
      devMode: false,
      emphasis: {
        currentModuleId: "mod_1",
        currentObjectiveId: "obj_1",
        currentPathConceptIds: ["concept_1"],
      },
      nodeCatalog: [
        {
          node: { id: "concept_1", nodeType: "concept", labels: ["Concept"], properties: { title: "Vectors" } },
          visibility: "learner",
          referenceSurfaceTarget: { refType: "concept", refId: "concept_1" },
          emphasis: "current_path",
          evidenceAvailable: true,
        },
      ],
      projectionWarning: null,
    });
    expect(parsed.viewMode).toBe("study_map");
    expect(parsed.nodeCatalog[0]?.referenceSurfaceTarget?.refId).toBe("concept_1");
  });
});
