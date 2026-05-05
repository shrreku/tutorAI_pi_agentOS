import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  notebooks,
  whiteboardNodes,
  concepts,
  sources,
  wikiPages,
  artifacts,
  claims,
  claimConceptLinks,
  chunks,
  sourceVersions,
  learningState,
  studyPlans,
} from "@studyagent/db";
import {
  createNeo4jDriver,
  queryConceptNeighborhood,
  queryConceptShortestPath,
  querySourceWikiMapSimple,
  queryStudyMapSimple,
  verifyNeo4jProjection,
} from "@studyagent/graph";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { resolveActor } from "../auth.js";
import type { GraphCanvasNode, GraphCanvasEdge } from "@studyagent/schemas";

type RawNeo4jNode = { id: string; labels: string[]; props: Record<string, unknown> };
type RawNeo4jEdge = { type: string; startId: string; endId: string; props: Record<string, unknown> };

function normalizeNodes(raw: RawNeo4jNode[]): GraphCanvasNode[] {
  return raw.map((n) => ({
    id: n.id,
    nodeType: (n.labels[0] ?? "unknown").toLowerCase(),
    labels: n.labels,
    properties: n.props,
  }));
}

function normalizeEdges(raw: RawNeo4jEdge[], existingIds: Set<string>): GraphCanvasEdge[] {
  return raw.map((e, idx) => {
    const base = `${e.startId}-${e.endId}-${e.type}-${idx}`;
    return {
      id: base,
      source: e.startId,
      target: e.endId,
      relationType: e.type,
      properties: e.props,
    };
  }).filter((e) => existingIds.has(e.source) && existingIds.has(e.target));
}

const graphQueryBodySchema = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("study_map"),
    limit: z.coerce.number().int().min(1).max(200).optional().default(80),
  }),
  z.object({
    name: z.literal("source_wiki_map"),
    sourceId: z.string().min(1),
    limit: z.coerce.number().int().min(1).max(200).optional().default(80),
  }),
  z.object({
    name: z.literal("concept_neighborhood"),
    conceptId: z.string().min(1),
    limit: z.coerce.number().int().min(1).max(200).optional().default(80),
  }),
  z.object({
    name: z.literal("concept_path"),
    fromConceptId: z.string().min(1),
    toConceptId: z.string().min(1),
    maxHops: z.coerce.number().int().min(1).max(12).optional().default(6),
  }),
]);

export async function registerGraphRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // Save or update node layout positions (persisted to whiteboard_nodes)
  app.post<{
    Params: { notebookId: string; nodeId: string };
    Body: { position: { x: number; y: number }; nodeType?: string; refType?: string };
  }>(
    "/notebooks/:notebookId/graph/layout/:nodeId",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId, nodeId } = request.params;
      const { position, nodeType = "unknown", refType = "whiteboard_node" } = request.body;

      const [owned] = await ctx.db.db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
        .limit(1);

      if (!owned) {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }

      const existing = await ctx.db.db
        .select()
        .from(whiteboardNodes)
        .where(and(eq(whiteboardNodes.notebookId, notebookId), eq(whiteboardNodes.refId, nodeId)))
        .limit(1);

      if (existing.length > 0 && existing[0]) {
        await ctx.db.db
          .update(whiteboardNodes)
          .set({ positionJson: position })
          .where(eq(whiteboardNodes.id, existing[0].id));
      } else {
        await ctx.db.db.insert(whiteboardNodes).values({
          id: `wbn_${nodeId}`,
          notebookId,
          nodeType,
          refType,
          refId: nodeId,
          positionJson: position,
          layoutJson: {},
          metadataJson: {},
        });
      }

      return reply.send({ ok: true, nodeId, position });
    },
  );

  // Delete all persisted layout positions for a notebook (reset to auto-layout)
  app.delete<{ Params: { notebookId: string } }>(
    "/notebooks/:notebookId/graph/layout",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId } = request.params;

      const [owned] = await ctx.db.db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
        .limit(1);

      if (!owned) {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }

      await ctx.db.db
        .delete(whiteboardNodes)
        .where(eq(whiteboardNodes.notebookId, notebookId));

      return reply.send({ ok: true, notebookId });
    },
  );

  // Get persisted layout positions for a notebook
  app.get<{ Params: { notebookId: string } }>(
    "/notebooks/:notebookId/graph/layout",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId } = request.params;

      const [owned] = await ctx.db.db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
        .limit(1);

      if (!owned) {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }

      const rows = await ctx.db.db
        .select()
        .from(whiteboardNodes)
        .where(eq(whiteboardNodes.notebookId, notebookId));

      const positions: Record<string, { x: number; y: number }> = {};
      for (const row of rows) {
        if (row.refId && row.positionJson) {
          positions[row.refId] = row.positionJson as { x: number; y: number };
        }
      }

      return reply.send({ positions });
    },
  );

  app.get<{ Params: { notebookId: string } }>(
    "/notebooks/:notebookId/graph/neo4j-health",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId } = request.params;

      const [owned] = await ctx.db.db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
        .limit(1);

      if (!owned) {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }

      if (!ctx.env.NEO4J_URI || !ctx.env.NEO4J_PASSWORD) {
        return reply.status(503).send({ ok: false, message: "Neo4j credentials not configured" });
      }

      const driver = createNeo4jDriver(ctx.env.NEO4J_URI, ctx.env.NEO4J_USERNAME, ctx.env.NEO4J_PASSWORD);
      const session = driver.session();
      try {
        const result = await verifyNeo4jProjection(session);
        if (!result.ok) {
          return reply.status(503).send(result);
        }
        return reply.send({ ok: true, notebookId });
      } finally {
        await session.close();
        await driver.close();
      }
    },
  );

  app.post<{ Params: { notebookId: string } }>(
    "/notebooks/:notebookId/graph/query",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId } = request.params;

      const [owned] = await ctx.db.db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
        .limit(1);

      if (!owned) {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }

      if (!ctx.env.NEO4J_URI || !ctx.env.NEO4J_PASSWORD) {
        return reply.status(503).send({ code: "graph_unavailable", message: "Neo4j not configured" });
      }

      const parsed = graphQueryBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ code: "bad_request", message: parsed.error.flatten() });
      }

      const driver = createNeo4jDriver(ctx.env.NEO4J_URI, ctx.env.NEO4J_USERNAME, ctx.env.NEO4J_PASSWORD);
      const session = driver.session();
      try {
        const body = parsed.data;
        if (body.name === "study_map") {
          const data = await queryStudyMapSimple(session, notebookId, body.limit);
          const nodes = normalizeNodes(data.nodes);
          const nodeIds = new Set(nodes.map((n) => n.id));
          const base = { name: body.name, notebookId, nodes, edges: normalizeEdges(data.edges, nodeIds) };
          const augmented = await augmentStudyMapWithPhaseSeven(ctx, notebookId, actor.id, base);
          return reply.send(augmented);
        }
        if (body.name === "source_wiki_map") {
          const data = await querySourceWikiMapSimple(session, notebookId, body.sourceId, body.limit);
          const nodes = normalizeNodes(data.nodes);
          const nodeIds = new Set(nodes.map((n) => n.id));
          return reply.send({ name: body.name, notebookId, sourceId: body.sourceId, nodes, edges: normalizeEdges(data.edges, nodeIds) });
        }
        if (body.name === "concept_neighborhood") {
          const nb = await queryConceptNeighborhood(session, notebookId, body.conceptId, body.limit);
          // Flatten neighborhood into canvas nodes+edges
          const rawNodes: GraphCanvasNode[] = [];
          const makeNode = (id: string, label: string, nodeType: string, title: string): GraphCanvasNode => ({
            id, nodeType, labels: [label], properties: { title },
          });
          if (nb.center) rawNodes.push(makeNode(nb.center.id, "Concept", "concept", nb.center.name));
          nb.prerequisites.forEach((n) => rawNodes.push(makeNode(n.id, "Concept", "concept", n.name)));
          nb.examples.forEach((n) => rawNodes.push(makeNode(n.id, "Concept", "concept", n.name)));
          nb.contradicts.forEach((n) => rawNodes.push(makeNode(n.id, "Concept", "concept", n.name)));
          nb.wikiPages.forEach((n) => rawNodes.push(makeNode(n.id, "WikiPage", "wiki_page", n.title)));
          nb.artifacts.forEach((n) => rawNodes.push(makeNode(n.id, "Artifact", "artifact", n.title)));
          const visibleIds = new Set(rawNodes.map((n) => n.id));
          const canvasEdges = nb.edges
            .filter((e) => visibleIds.has(e.startId) && visibleIds.has(e.endId))
            .map((e, idx) => ({
              id: `${e.startId}-${e.endId}-${e.type}-${idx}`,
              source: e.startId,
              target: e.endId,
              relationType: e.type,
              properties: {} as Record<string, unknown>,
            }));
          return reply.send({ name: body.name, notebookId, conceptId: body.conceptId, nodes: rawNodes, edges: canvasEdges });
        }
        const pathResult = await queryConceptShortestPath(
          session,
          notebookId,
          body.fromConceptId,
          body.toConceptId,
          body.maxHops,
        );
        // Build minimal canvas nodes from nodeIds (just IDs, no titles in path result)
        const pathNodes: GraphCanvasNode[] = pathResult.nodeIds.map((id) => ({
          id, nodeType: "concept", labels: ["Concept"], properties: { title: id.slice(0, 12) },
        }));
        const pathEdges = pathResult.nodeIds.slice(0, -1).map((id, idx) => ({
          id: `path-${idx}`,
          source: id,
          target: pathResult.nodeIds[idx + 1] ?? id,
          relationType: pathResult.relTypes[idx] ?? "RELATED",
          properties: {} as Record<string, unknown>,
        }));
        return reply.send({
          name: body.name,
          notebookId,
          fromConceptId: body.fromConceptId,
          toConceptId: body.toConceptId,
          nodes: pathNodes,
          edges: pathEdges,
        });
      } finally {
        await session.close();
        await driver.close();
      }
    },
  );

  // GF-0606: Provenance endpoint — returns real source refs, chunks, claims for a graph node
  app.get<{ Params: { notebookId: string; nodeId: string } }>(
    "/notebooks/:notebookId/nodes/:nodeId/provenance",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId, nodeId } = request.params;

      const [owned] = await ctx.db.db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
        .limit(1);

      if (!owned) {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }

      type ProvenanceResult = {
        nodeId: string;
        entityType: string | null;
        entity: Record<string, unknown> | null;
        claimRefs: Array<{ id: string; claimType: string; claimText: string; confidence: number; status: string }>;
        chunkRefs: Array<{ id: string; chunkType: string; text: string; pageStart?: number | null; pageEnd?: number | null }>;
      };

      const result: ProvenanceResult = {
        nodeId,
        entityType: null,
        entity: null,
        claimRefs: [],
        chunkRefs: [],
      };

      // Try concept
      const [concept] = await ctx.db.db.select().from(concepts).where(eq(concepts.id, nodeId)).limit(1);
      if (concept) {
        result.entityType = "concept";
        result.entity = {
          id: concept.id,
          canonicalName: concept.canonicalName,
          conceptType: concept.conceptType,
          description: concept.description,
          confidence: concept.confidence,
        };
        // Fetch linked claims via claimConceptLinks
        const links = await ctx.db.db
          .select({ claimId: claimConceptLinks.claimId })
          .from(claimConceptLinks)
          .where(eq(claimConceptLinks.conceptId, nodeId));
        if (links.length > 0) {
          const claimIds = links.map((l) => l.claimId);
          const claimRows = await ctx.db.db
            .select()
            .from(claims)
            .where(inArray(claims.id, claimIds))
            .limit(20);
          result.claimRefs = claimRows.map((c) => ({
            id: c.id,
            claimType: c.claimType,
            claimText: c.claimText,
            confidence: c.confidence,
            status: c.status,
          }));
          // Fetch chunks referenced by those claims
          const chunkIds = Array.from(new Set(claimRows.flatMap((c) => c.sourceChunkIds ?? [])));
          if (chunkIds.length > 0) {
            const chunkRows = await ctx.db.db
              .select()
              .from(chunks)
              .where(inArray(chunks.id, chunkIds))
              .limit(10);
            result.chunkRefs = chunkRows.map((c) => ({
              id: c.id,
              chunkType: c.chunkType,
              text: c.text.slice(0, 400),
              pageStart: c.pageStart,
              pageEnd: c.pageEnd,
            }));
          }
        }
        return reply.send(result);
      }

      // Try wiki_page
      const [wikiPage] = await ctx.db.db.select().from(wikiPages).where(eq(wikiPages.id, nodeId)).limit(1);
      if (wikiPage) {
        result.entityType = "wiki_page";
        result.entity = {
          id: wikiPage.id,
          title: wikiPage.title,
          pageType: wikiPage.pageType,
          status: wikiPage.status,
          qualityScore: wikiPage.qualityScore,
        };
        const claimIds = wikiPage.sourceClaimIds ?? [];
        if (claimIds.length > 0) {
          const claimRows = await ctx.db.db.select().from(claims).where(inArray(claims.id, claimIds)).limit(10);
          result.claimRefs = claimRows.map((c) => ({
            id: c.id, claimType: c.claimType, claimText: c.claimText, confidence: c.confidence, status: c.status,
          }));
        }
        const chunkIds = wikiPage.sourceChunkIds ?? [];
        if (chunkIds.length > 0) {
          const chunkRows = await ctx.db.db.select().from(chunks).where(inArray(chunks.id, chunkIds)).limit(10);
          result.chunkRefs = chunkRows.map((c) => ({
            id: c.id, chunkType: c.chunkType, text: c.text.slice(0, 400), pageStart: c.pageStart, pageEnd: c.pageEnd,
          }));
        }
        return reply.send(result);
      }

      // Try artifact
      const [artifact] = await ctx.db.db.select().from(artifacts).where(eq(artifacts.id, nodeId)).limit(1);
      if (artifact) {
        result.entityType = "artifact";
        result.entity = {
          id: artifact.id,
          title: artifact.title,
          artifactType: artifact.artifactType,
          status: artifact.status,
        };
        const claimIds = artifact.sourceClaimIds ?? [];
        if (claimIds.length > 0) {
          const claimRows = await ctx.db.db.select().from(claims).where(inArray(claims.id, claimIds)).limit(10);
          result.claimRefs = claimRows.map((c) => ({
            id: c.id, claimType: c.claimType, claimText: c.claimText, confidence: c.confidence, status: c.status,
          }));
        }
        const chunkIds = artifact.sourceChunkIds ?? [];
        if (chunkIds.length > 0) {
          const chunkRows = await ctx.db.db.select().from(chunks).where(inArray(chunks.id, chunkIds)).limit(10);
          result.chunkRefs = chunkRows.map((c) => ({
            id: c.id, chunkType: c.chunkType, text: c.text.slice(0, 400), pageStart: c.pageStart, pageEnd: c.pageEnd,
          }));
        }
        return reply.send(result);
      }

      // Try source
      const [source] = await ctx.db.db.select().from(sources).where(eq(sources.id, nodeId)).limit(1);
      if (source) {
        result.entityType = "source";
        result.entity = {
          id: source.id,
          title: source.title,
          sourceType: source.sourceType,
          status: source.status,
        };
        // Fetch latest source version chunks
        const [latestVersion] = await ctx.db.db
          .select()
          .from(sourceVersions)
          .where(eq(sourceVersions.sourceId, nodeId))
          .orderBy(sourceVersions.version)
          .limit(1);
        if (latestVersion) {
          const chunkRows = await ctx.db.db
            .select()
            .from(chunks)
            .where(eq(chunks.sourceVersionId, latestVersion.id))
            .limit(10);
          result.chunkRefs = chunkRows.map((c) => ({
            id: c.id, chunkType: c.chunkType, text: c.text.slice(0, 400), pageStart: c.pageStart, pageEnd: c.pageEnd,
          }));
        }
        return reply.send(result);
      }

      // Try claim
      const [claim] = await ctx.db.db.select().from(claims).where(eq(claims.id, nodeId)).limit(1);
      if (claim) {
        result.entityType = "claim";
        result.entity = {
          id: claim.id,
          claimType: claim.claimType,
          claimText: claim.claimText,
          confidence: claim.confidence,
          status: claim.status,
        };
        result.claimRefs = [{
          id: claim.id,
          claimType: claim.claimType,
          claimText: claim.claimText,
          confidence: claim.confidence,
          status: claim.status,
        }];
        const chunkIds = claim.sourceChunkIds ?? [];
        if (chunkIds.length > 0) {
          const chunkRows = await ctx.db.db.select().from(chunks).where(inArray(chunks.id, chunkIds)).limit(10);
          result.chunkRefs = chunkRows.map((c) => ({
            id: c.id, chunkType: c.chunkType, text: c.text.slice(0, 400), pageStart: c.pageStart, pageEnd: c.pageEnd,
          }));
        }
        return reply.send(result);
      }

      // Node not found in any postgres table (may be Neo4j-only or unknown)
      return reply.send(result);
    },
  );
}

async function augmentStudyMapWithPhaseSeven(
  ctx: AppContext,
  notebookId: string,
  userId: string,
  base: { name: string; notebookId: string; nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[] },
): Promise<{ name: string; notebookId: string; nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[] }> {
  const nodes = [...base.nodes];
  const edges = [...base.edges];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  const learningRows = await ctx.db.db
    .select({
      conceptId: learningState.conceptId,
      masteryScore: learningState.masteryScore,
      confidence: learningState.confidence,
    })
    .from(learningState)
    .where(and(eq(learningState.notebookId, notebookId), eq(learningState.userId, userId)));

  const masteryByConceptId = new Map(learningRows.map((row) => [row.conceptId, row]));
  for (const node of nodes) {
    if (node.nodeType !== "concept") continue;
    const mastery = masteryByConceptId.get(node.id);
    if (!mastery) continue;
    node.properties = {
      ...node.properties,
      masteryScore: mastery.masteryScore,
      learningConfidence: mastery.confidence,
      status: mastery.masteryScore < 0.45 ? "weak" : mastery.masteryScore >= 0.75 ? "mastered" : "active",
    };
  }

  const [studyPlan] = await ctx.db.db
    .select({
      id: studyPlans.id,
      weakConceptIds: studyPlans.weakConceptIds,
    })
    .from(studyPlans)
    .where(and(eq(studyPlans.notebookId, notebookId), eq(studyPlans.userId, userId)))
    .limit(1);

  if (studyPlan?.weakConceptIds?.length) {
    const weakConceptRows = await ctx.db.db
      .select({
        id: concepts.id,
        title: concepts.canonicalName,
      })
      .from(concepts)
      .where(and(eq(concepts.notebookId, notebookId), inArray(concepts.id, studyPlan.weakConceptIds)));

    for (const concept of weakConceptRows) {
      const weakNodeId = `weak_${concept.id}`;
      if (!nodeMap.has(concept.id)) {
        const mastery = masteryByConceptId.get(concept.id);
        const conceptNode: GraphCanvasNode = {
          id: concept.id,
          nodeType: "concept",
          labels: ["Concept"],
          properties: {
            title: concept.title,
            ...(mastery ? { masteryScore: mastery.masteryScore, learningConfidence: mastery.confidence } : {}),
          },
        };
        nodes.push(conceptNode);
        nodeMap.set(concept.id, conceptNode);
      }
      if (!nodeMap.has(weakNodeId)) {
        const mastery = masteryByConceptId.get(concept.id);
        const weakNode: GraphCanvasNode = {
          id: weakNodeId,
          nodeType: "weak_concept",
          labels: ["WeakConcept"],
          properties: {
            title: concept.title,
            conceptId: concept.id,
            masteryScore: mastery?.masteryScore ?? 0,
            status: "active",
          },
        };
        nodes.push(weakNode);
        nodeMap.set(weakNodeId, weakNode);
      }
      edges.push({
        id: `weak-${weakNodeId}-${concept.id}`,
        source: weakNodeId,
        target: concept.id,
        relationType: "REMEDIATES",
        properties: {},
      });
    }
  }

  const recentArtifacts = await ctx.db.db
    .select({
      id: artifacts.id,
      title: artifacts.title,
      artifactType: artifacts.artifactType,
      status: artifacts.status,
      payloadJson: artifacts.payloadJson,
    })
    .from(artifacts)
    .where(eq(artifacts.notebookId, notebookId))
    .orderBy(desc(artifacts.updatedAt))
    .limit(12);

  const studyPlanNode = nodes.find((node) => node.nodeType === "studyplan" || node.nodeType === "study_plan");
  for (const artifact of recentArtifacts) {
    if (!nodeMap.has(artifact.id)) {
      const artifactNode: GraphCanvasNode = {
        id: artifact.id,
        nodeType: "artifact",
        labels: ["Artifact"],
        properties: {
          title: artifact.title,
          artifactType: artifact.artifactType,
          status: artifact.status,
        },
      };
      nodes.push(artifactNode);
      nodeMap.set(artifact.id, artifactNode);
    }

    const conceptIds = Array.isArray(artifact.payloadJson?.conceptIds)
      ? artifact.payloadJson.conceptIds.filter((value): value is string => typeof value === "string")
      : [];

    for (const conceptId of conceptIds) {
      if (!nodeMap.has(conceptId)) continue;
      edges.push({
        id: `artifact-${artifact.id}-${conceptId}`,
        source: artifact.id,
        target: conceptId,
        relationType: artifact.artifactType === "quiz" ? "TESTS_MASTERY" : "DERIVED_FROM",
        properties: {},
      });
    }

    if (studyPlanNode) {
      edges.push({
        id: `studyplan-${studyPlanNode.id}-${artifact.id}`,
        source: studyPlanNode.id,
        target: artifact.id,
        relationType: "COMPLETED_BY",
        properties: {},
      });
    }
  }

  const seenEdgeIds = new Set<string>();
  return {
    ...base,
    nodes,
    edges: edges.filter((edge) => {
      if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) return false;
      if (seenEdgeIds.has(edge.id)) return false;
      seenEdgeIds.add(edge.id);
      return true;
    }),
  };
}
