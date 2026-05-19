import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  appendEvent,
  notebooks,
  whiteboardNodes,
  artifacts,
  claimConceptLinks,
  claims,
  chunks,
  concepts,
  studyPlans,
  sources,
  sourceVersions,
  curricula,
  curriculumModules,
  objectives,
  objectiveLists,
  sessionPlans,
  wikiPages,
} from "@studyagent/db";
import {
  createNeo4jDriver,
  queryConceptNeighborhood,
  queryConceptShortestPath,
  querySourceWikiMapSimple,
  queryStudyMapSimple,
  verifyNeo4jProjection,
  buildSourceWikiTopicProjection,
  normalizeNeo4jCanvasEdges,
  normalizeNeo4jCanvasNodes,
  loadNotebookProjectionHealth,
  loadSourceProjectionHealth,
} from "@studyagent/graph";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { resolveActor } from "../auth.js";
import type { GraphCanvasNode, GraphCanvasEdge } from "@studyagent/schemas";
import { buildNodeEvidence, buildReferenceSurface as buildReferenceSurfaceModule, readablePlanningSummary } from "../reference-surface.js";
import { buildSourceWikiReadModel, buildStudyMapReadModel } from "../workspace-read-model.js";

const graphQueryBodySchema = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("study_map"),
    limit: z.coerce.number().int().min(1).max(200).optional().default(80),
    devMode: z.boolean().optional().default(false),
  }),
  z.object({
    name: z.literal("source_wiki_map"),
    sourceId: z.string().min(1),
    limit: z.coerce.number().int().min(1).max(200).optional().default(80),
    devMode: z.boolean().optional().default(false),
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
          const nodes = normalizeNeo4jCanvasNodes(data.nodes);
          const nodeIds = new Set(nodes.map((n) => n.id));
          const base = { nodes, edges: normalizeNeo4jCanvasEdges(data.edges, nodeIds) };
          const projectionHealth = await loadNotebookProjectionHealth(ctx.db, notebookId, body.devMode);
          const projectionWarning =
            projectionHealth.learnerWarning ??
            (base.nodes.length === 0 ? "Study Map is still building. Uploaded sources may still be processing." : null);
          const readModelPayload = await buildStudyMapReadModel(ctx, notebookId, actor.id, base, {
            devMode: body.devMode,
            projectionWarning,
            projectionHealth,
          });
          const { nodes: visibleNodes, edges: visibleEdges, ...readModel } = readModelPayload;
          return reply.send({
            name: body.name,
            notebookId,
            nodes: visibleNodes,
            edges: visibleEdges,
            readModel,
          });
        }
        if (body.name === "source_wiki_map") {
          const data = await querySourceWikiMapSimple(session, notebookId, body.sourceId, body.limit);
          const nodes = normalizeNeo4jCanvasNodes(data.nodes).filter((node) => node.nodeType !== "claim");
          const nodeIds = new Set(nodes.map((n) => n.id));
          const edges = normalizeNeo4jCanvasEdges(data.edges, nodeIds);
          const projected = buildSourceWikiTopicProjection({ notebookId, sourceId: body.sourceId, nodes, edges });
          const projectionHealth = await loadSourceProjectionHealth(ctx.db, notebookId, body.sourceId, body.devMode);
          const projectionWarning =
            projectionHealth.learnerWarning ??
            (projected.nodes.length <= 1 ? "Source Wiki is still building for this source." : null);
          const readModelPayload = await buildSourceWikiReadModel(
            ctx,
            notebookId,
            actor.id,
            projected,
            body.sourceId,
            { devMode: body.devMode, projectionWarning, projectionHealth },
          );
          const { nodes: visibleNodes, edges: visibleEdges, ...readModel } = readModelPayload;
          return reply.send({
            name: body.name,
            notebookId,
            sourceId: body.sourceId,
            nodes: visibleNodes,
            edges: visibleEdges,
            readModel,
          });
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
          id, nodeType: "concept", labels: ["Concept"], properties: { title: "Concept needs review", needsReview: true },
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

      const devMode = typeof request.query === "object" && request.query !== null && (request.query as Record<string, unknown>).devMode === "true";
      return reply.send(await buildNodeEvidence(ctx, notebookId, nodeId, { devMode }));
    },
  );

  app.get<{ Params: { notebookId: string; nodeId: string } }>(
    "/notebooks/:notebookId/nodes/:nodeId/reference-surface",
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

      const surface = await buildReferenceSurfaceModule(ctx, notebookId, nodeId);
      return reply.send(surface);
    },
  );

  app.post<{
    Params: { notebookId: string; nodeId: string };
    Body: { target?: string; instruction?: string };
  }>(
    "/notebooks/:notebookId/nodes/:nodeId/regenerate-reference",
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

      const instruction =
        typeof request.body?.instruction === "string" && request.body.instruction.trim()
          ? request.body.instruction.trim().slice(0, 2000)
          : "";
      const result = await regenerateReferenceSurface(ctx, notebookId, nodeId, instruction);
      if (!result) {
        return reply.status(404).send({ code: "not_found", message: "Regeneratable page or artifact not found" });
      }
      return reply.send(result);
    },
  );

  app.get<{ Params: { notebookId: string } }>(
    "/notebooks/:notebookId/curriculum-outline",
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

      return reply.send(await buildCurriculumOutlineReadModel(ctx, notebookId, actor.id));
    },
  );
}

async function regenerateReferenceSurface(ctx: AppContext, notebookId: string, nodeId: string, instruction: string): Promise<{ ok: true; kind: string; id: string } | null> {
  const now = new Date();
  const [artifact] = await ctx.db.db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, nodeId), eq(artifacts.notebookId, notebookId)))
    .limit(1);
  if (artifact) {
    const sourceText = await loadSourceExcerpt(ctx, artifact.sourceChunkIds ?? []);
    const generated = await generateStudyMarkdown(ctx, {
      title: artifact.title,
      kind: `artifact:${artifact.artifactType}`,
      currentMarkdown: typeof artifact.payloadJson?.markdown === "string" ? artifact.payloadJson.markdown : "",
      sourceText,
      instruction,
    });
    const markdown = generated.markdown;
    const payload = {
      ...(artifact.payloadJson ?? {}),
      regeneratedMarkdown: markdown,
      regeneratedMode: generated.mode,
      regeneratedAt: now.toISOString(),
      regeneratedBy: "reference_surface_regenerate",
    };
    await ctx.db.db
      .update(artifacts)
      .set({ payloadJson: payload, status: "ready", updatedAt: now })
      .where(and(eq(artifacts.id, artifact.id), eq(artifacts.notebookId, notebookId)));
    await appendEvent(ctx.db, {
      notebookId,
      eventType: "artifact.updated",
      payload: { artifactId: artifact.id, artifactType: artifact.artifactType, trigger: "reference_surface_regenerate" },
    });
    return { ok: true, kind: "artifact", id: artifact.id };
  }

  const [page] = await ctx.db.db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.id, nodeId), eq(wikiPages.notebookId, notebookId)))
    .limit(1);
  if (page) {
    const generated = await generateStudyMarkdown(ctx, {
      title: page.title,
      kind: `wiki_page:${page.pageType}`,
      currentMarkdown: page.markdown,
      sourceText: await loadSourceExcerpt(ctx, page.sourceChunkIds ?? []),
      instruction,
    });
    const markdown = generated.markdown;
    await ctx.db.db
      .update(wikiPages)
      .set({
        markdown,
        status: "published",
        version: page.version + 1,
        qualityScore: 0.82,
        structuredJson: { ...(page.structuredJson ?? {}), regeneratedMode: generated.mode, regeneratedAt: now.toISOString(), regeneratedBy: "reference_surface_regenerate" },
        updatedAt: now,
      })
      .where(and(eq(wikiPages.id, page.id), eq(wikiPages.notebookId, notebookId)));
    await appendEvent(ctx.db, {
      notebookId,
      eventType: "wiki.page.updated",
      payload: { pageId: page.id, pageKey: page.pageKey, trigger: "reference_surface_regenerate" },
    });
    return { ok: true, kind: "wiki_page", id: page.id };
  }

  const [curriculum] = await ctx.db.db
    .select()
    .from(curricula)
    .where(and(eq(curricula.id, nodeId), eq(curricula.notebookId, notebookId)))
    .limit(1);
  if (curriculum) {
    const moduleRows = await ctx.db.db
      .select({ title: curriculumModules.title, summary: curriculumModules.summary, status: curriculumModules.status, orderIndex: curriculumModules.orderIndex })
      .from(curriculumModules)
      .where(and(eq(curriculumModules.notebookId, notebookId), eq(curriculumModules.curriculumId, curriculum.id)))
      .orderBy(asc(curriculumModules.orderIndex))
      .limit(16);
    const currentMarkdown = [
      `# ${curriculum.title}`,
      "",
      typeof curriculum.scopeJson?.summary === "string" ? curriculum.scopeJson.summary : "",
      "",
      "## Current modules",
      ...moduleRows.map((row) => `- ${row.title}: ${readablePlanningSummary(row.summary, row.title) ?? row.status}`),
    ].join("\n");
    const generated = await generateStudyMarkdown(ctx, {
      title: curriculum.title,
      kind: "curriculum",
      currentMarkdown,
      sourceText: await loadSourceExcerptForSourceIds(ctx, notebookId, curriculum.sourceIds ?? []),
      instruction,
    });
    const markdown = generated.markdown;
    await ctx.db.db
      .update(curricula)
      .set({
        scopeJson: { ...(curriculum.scopeJson ?? {}), summary: firstParagraph(markdown), regeneratedMarkdown: markdown, regeneratedMode: generated.mode, regeneratedAt: now.toISOString(), regeneratedBy: "reference_surface_regenerate" },
        updatedAt: now,
      })
      .where(and(eq(curricula.id, curriculum.id), eq(curricula.notebookId, notebookId)));
    await appendReferenceRegeneratedEvent(ctx, notebookId, "curriculum", curriculum.id);
    return { ok: true, kind: "curriculum", id: curriculum.id };
  }

  const [module] = await ctx.db.db
    .select()
    .from(curriculumModules)
    .where(and(eq(curriculumModules.id, nodeId), eq(curriculumModules.notebookId, notebookId)))
    .limit(1);
  if (module) {
    const [objectiveList] = await ctx.db.db
      .select()
      .from(objectiveLists)
      .where(and(eq(objectiveLists.notebookId, notebookId), eq(objectiveLists.moduleId, module.id)))
      .limit(1);
    const objectiveRows = objectiveList?.objectiveIdsOrdered?.length
      ? await ctx.db.db
          .select({ id: objectives.id, title: objectives.title, status: objectives.status, successCriteriaJson: objectives.successCriteriaJson })
          .from(objectives)
          .where(and(eq(objectives.notebookId, notebookId), inArray(objectives.id, objectiveList.objectiveIdsOrdered)))
      : [];
    const order = new Map((objectiveList?.objectiveIdsOrdered ?? []).map((id, index) => [id, index] as const));
    const orderedObjectives = [...objectiveRows].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const currentMarkdown = [
      `# ${module.title}`,
      "",
      module.summary ?? "",
      "",
      "## Objectives",
      ...orderedObjectives.map((objective) => `- ${objective.title}: ${objectiveSuccessSummary(objective.successCriteriaJson)}`),
    ].join("\n");
    const sourceRefs = parseSourceLikeRefs(module.sourceRefsJson);
    const generated = await generateStudyMarkdown(ctx, {
      title: module.title,
      kind: "module",
      currentMarkdown,
      sourceText: await loadSourceExcerptForRefs(ctx, notebookId, sourceRefs),
      instruction,
    });
    const markdown = generated.markdown;
    await ctx.db.db
      .update(curriculumModules)
      .set({
        summary: firstParagraph(markdown),
        coverageRequirementsJson: { ...(module.coverageRequirementsJson ?? {}), regeneratedMarkdown: markdown, regeneratedMode: generated.mode, regeneratedAt: now.toISOString(), regeneratedBy: "reference_surface_regenerate" },
        updatedAt: now,
      })
      .where(and(eq(curriculumModules.id, module.id), eq(curriculumModules.notebookId, notebookId)));
    await appendReferenceRegeneratedEvent(ctx, notebookId, "module", module.id);
    return { ok: true, kind: "module", id: module.id };
  }

  const [objectiveList] = await ctx.db.db
    .select()
    .from(objectiveLists)
    .where(and(eq(objectiveLists.id, nodeId), eq(objectiveLists.notebookId, notebookId)))
    .limit(1);
  if (objectiveList) {
    const objectiveRows = objectiveList.objectiveIdsOrdered.length
      ? await ctx.db.db
          .select({ id: objectives.id, title: objectives.title, status: objectives.status, successCriteriaJson: objectives.successCriteriaJson, sourceRefsJson: objectives.sourceRefsJson })
          .from(objectives)
          .where(and(eq(objectives.notebookId, notebookId), inArray(objectives.id, objectiveList.objectiveIdsOrdered)))
      : [];
    const order = new Map(objectiveList.objectiveIdsOrdered.map((id, index) => [id, index] as const));
    const orderedObjectives = [...objectiveRows].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const currentMarkdown = [
      "# Objective list",
      "",
      "## Current sequence",
      ...orderedObjectives.map((objective, index) => `${index + 1}. ${objective.title}: ${objectiveSuccessSummary(objective.successCriteriaJson)}`),
    ].join("\n");
    const sourceRefs = orderedObjectives.flatMap((objective) => parseSourceLikeRefs(objective.sourceRefsJson));
    const generated = await generateStudyMarkdown(ctx, {
      title: "Objective list",
      kind: "objective_list",
      currentMarkdown,
      sourceText: await loadSourceExcerptForRefs(ctx, notebookId, sourceRefs),
      instruction,
    });
    const markdown = generated.markdown;
    await ctx.db.db
      .update(objectiveLists)
      .set({
        coverageSnapshotJson: { ...(objectiveList.coverageSnapshotJson ?? {}), regeneratedMarkdown: markdown, regeneratedMode: generated.mode, regeneratedAt: now.toISOString(), regeneratedBy: "reference_surface_regenerate" },
        updatedAt: now,
      })
      .where(and(eq(objectiveLists.id, objectiveList.id), eq(objectiveLists.notebookId, notebookId)));
    await appendReferenceRegeneratedEvent(ctx, notebookId, "objective_list", objectiveList.id);
    return { ok: true, kind: "objective_list", id: objectiveList.id };
  }

  const [objective] = await ctx.db.db
    .select()
    .from(objectives)
    .where(and(eq(objectives.id, nodeId), eq(objectives.notebookId, notebookId)))
    .limit(1);
  if (objective) {
    const currentMarkdown = [
      `# ${objective.title}`,
      "",
      "## Success criteria",
      JSON.stringify(objective.successCriteriaJson ?? {}, null, 2),
      "",
      "## Target concepts",
      [...(objective.prerequisiteConceptIds ?? []), ...(objective.targetConceptIds ?? [])].map((id) => `- ${id}`).join("\n"),
    ].join("\n");
    const generated = await generateStudyMarkdown(ctx, {
      title: objective.title,
      kind: "objective",
      currentMarkdown,
      sourceText: await loadSourceExcerptForRefs(ctx, notebookId, parseSourceLikeRefs(objective.sourceRefsJson)),
      instruction,
    });
    const markdown = generated.markdown;
    await ctx.db.db
      .update(objectives)
      .set({
        successCriteriaJson: { ...(objective.successCriteriaJson ?? {}), regeneratedMarkdown: markdown, regeneratedMode: generated.mode, regeneratedAt: now.toISOString(), regeneratedBy: "reference_surface_regenerate" },
        updatedAt: now,
      })
      .where(and(eq(objectives.id, objective.id), eq(objectives.notebookId, notebookId)));
    await appendReferenceRegeneratedEvent(ctx, notebookId, "objective", objective.id);
    return { ok: true, kind: "objective", id: objective.id };
  }

  const [sessionPlan] = await ctx.db.db
    .select()
    .from(sessionPlans)
    .where(and(eq(sessionPlans.id, nodeId), eq(sessionPlans.notebookId, notebookId)))
    .limit(1);
  if (sessionPlan) {
    const objectiveRows = sessionPlan.plannedObjectiveIds.length
      ? await ctx.db.db
          .select({ id: objectives.id, title: objectives.title, status: objectives.status, successCriteriaJson: objectives.successCriteriaJson, sourceRefsJson: objectives.sourceRefsJson })
          .from(objectives)
          .where(and(eq(objectives.notebookId, notebookId), inArray(objectives.id, sessionPlan.plannedObjectiveIds)))
      : [];
    const order = new Map(sessionPlan.plannedObjectiveIds.map((id, index) => [id, index] as const));
    const orderedObjectives = [...objectiveRows].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const currentMarkdown = [
      `# ${sessionPlan.title}`,
      "",
      sessionPlan.sessionGoal ?? "",
      "",
      "## Planned objectives",
      ...orderedObjectives.map((objective) => `- ${objective.title}: ${objectiveSuccessSummary(objective.successCriteriaJson)}`),
    ].join("\n");
    const sourceRefs = orderedObjectives.flatMap((objective) => parseSourceLikeRefs(objective.sourceRefsJson));
    const generated = await generateStudyMarkdown(ctx, {
      title: sessionPlan.title,
      kind: "session_plan",
      currentMarkdown,
      sourceText: await loadSourceExcerptForRefs(ctx, notebookId, sourceRefs),
      instruction,
    });
    const markdown = generated.markdown;
    await ctx.db.db
      .update(sessionPlans)
      .set({
        sessionGoal: firstParagraph(markdown),
        recommendationReasonJson: { ...(sessionPlan.recommendationReasonJson ?? {}), regeneratedMarkdown: markdown, regeneratedMode: generated.mode, regeneratedAt: now.toISOString(), regeneratedBy: "reference_surface_regenerate" },
        updatedAt: now,
      })
      .where(and(eq(sessionPlans.id, sessionPlan.id), eq(sessionPlans.notebookId, notebookId)));
    await appendReferenceRegeneratedEvent(ctx, notebookId, "session_plan", sessionPlan.id);
    return { ok: true, kind: "session_plan", id: sessionPlan.id };
  }

  const [concept] = await ctx.db.db
    .select()
    .from(concepts)
    .where(and(eq(concepts.id, nodeId), eq(concepts.notebookId, notebookId)))
    .limit(1);
  if (!concept) return null;
  const existing = await ctx.db.db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.notebookId, notebookId), eq(wikiPages.pageType, "concept"), eq(wikiPages.pageKey, `concept:${concept.id}`)))
    .limit(1);
  const sourceText = await loadConceptSourceExcerpt(ctx, notebookId, concept.id);
  const generated = await generateStudyMarkdown(ctx, {
    title: concept.canonicalName,
    kind: "concept_wiki_page",
    currentMarkdown: existing[0]?.markdown ?? concept.description ?? "",
    sourceText,
    instruction,
  });
  const markdown = generated.markdown;
  const pageId = existing[0]?.id ?? `wp_${crypto.randomUUID().replaceAll("-", "")}`;
  if (existing[0]) {
    await ctx.db.db
      .update(wikiPages)
      .set({
        markdown,
        status: "published",
        version: existing[0].version + 1,
        qualityScore: 0.82,
        structuredJson: { ...(existing[0].structuredJson ?? {}), conceptId: concept.id, regeneratedMode: generated.mode, regeneratedAt: now.toISOString(), regeneratedBy: "reference_surface_regenerate" },
        updatedAt: now,
      })
      .where(and(eq(wikiPages.id, pageId), eq(wikiPages.notebookId, notebookId)));
  } else {
    await ctx.db.db.insert(wikiPages).values({
      id: pageId,
      notebookId,
      pageType: "concept",
      pageKey: `concept:${concept.id}`,
      title: `Concept · ${concept.canonicalName}`,
      version: 1,
      status: "published",
      structuredJson: { conceptId: concept.id, regeneratedMode: generated.mode, regeneratedAt: now.toISOString(), regeneratedBy: "reference_surface_regenerate" },
      markdown,
      sourceClaimIds: [],
      sourceChunkIds: [],
      confidenceSummaryJson: { regenerated: true },
      qualityScore: 0.82,
      createdAt: now,
      updatedAt: now,
    });
  }
  await ctx.db.db
    .update(concepts)
    .set({ description: firstParagraph(markdown), updatedAt: now })
    .where(and(eq(concepts.id, concept.id), eq(concepts.notebookId, notebookId)));
  await appendEvent(ctx.db, {
    notebookId,
    eventType: "wiki.page.updated",
    payload: { pageId, conceptId: concept.id, trigger: "reference_surface_regenerate" },
  });
  return { ok: true, kind: "concept", id: concept.id };
}

async function loadSourceExcerpt(ctx: AppContext, chunkIds: string[]): Promise<string> {
  if (!chunkIds.length) return "";
  const rows = await ctx.db.db
    .select({ text: chunks.text })
    .from(chunks)
    .where(inArray(chunks.id, chunkIds.slice(0, 12)))
    .limit(12);
  return rows.map((row) => row.text).join("\n\n").slice(0, 9000);
}

async function loadSourceExcerptForRefs(ctx: AppContext, notebookId: string, refs: Array<{ refType: "source" | "chunk"; refId: string }>): Promise<string> {
  const chunkIds = refs.filter((ref) => ref.refType === "chunk").map((ref) => ref.refId);
  const sourceIds = refs.filter((ref) => ref.refType === "source").map((ref) => ref.refId);
  const [chunkText, sourceText] = await Promise.all([
    loadSourceExcerpt(ctx, Array.from(new Set(chunkIds))),
    loadSourceExcerptForSourceIds(ctx, notebookId, Array.from(new Set(sourceIds))),
  ]);
  return [chunkText, sourceText].filter(Boolean).join("\n\n").slice(0, 9000);
}

async function loadSourceExcerptForSourceIds(ctx: AppContext, notebookId: string, sourceIds: string[]): Promise<string> {
  if (!sourceIds.length) return "";
  const validSources = await ctx.db.db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.notebookId, notebookId), inArray(sources.id, sourceIds.slice(0, 8))))
    .limit(8);
  const validSourceIds = validSources.map((source) => source.id);
  if (!validSourceIds.length) return "";
  const versions = await ctx.db.db
    .select({ id: sourceVersions.id })
    .from(sourceVersions)
    .where(inArray(sourceVersions.sourceId, validSourceIds))
    .orderBy(desc(sourceVersions.version))
    .limit(8);
  if (!versions.length) return "";
  const rows = await ctx.db.db
    .select({ text: chunks.text })
    .from(chunks)
    .where(inArray(chunks.sourceVersionId, versions.map((version) => version.id)))
    .limit(12);
  return rows.map((row) => row.text).join("\n\n").slice(0, 9000);
}

async function loadConceptSourceExcerpt(ctx: AppContext, notebookId: string, conceptId: string): Promise<string> {
  const links = await ctx.db.db.select({ claimId: claimConceptLinks.claimId }).from(claimConceptLinks).where(eq(claimConceptLinks.conceptId, conceptId));
  const claimIds = links.map((link) => link.claimId);
  if (!claimIds.length) return "";
  const claimRows = await ctx.db.db.select({ sourceChunkIds: claims.sourceChunkIds }).from(claims).where(and(eq(claims.notebookId, notebookId), inArray(claims.id, claimIds))).limit(16);
  return loadSourceExcerpt(ctx, Array.from(new Set(claimRows.flatMap((claim) => claim.sourceChunkIds ?? []))));
}

function parseSourceLikeRefs(value: unknown): Array<{ refType: "source" | "chunk"; refId: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    const refId = typeof record.refId === "string" ? record.refId : typeof record.id === "string" ? record.id : null;
    if (!refId) return [];
    return [{ refType: record.refType === "chunk" ? "chunk" : "source", refId }];
  });
}

function objectiveSuccessSummary(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "Study this objective, then check understanding in tutor chat.";
  const statements = Object.entries(value as Record<string, unknown>)
    .flatMap(([key, entry]) => {
      if (key === "regeneratedMarkdown" || key.endsWith("At") || key.endsWith("By")) return [];
      if (typeof entry === "string") return [`${labelFromKey(key)}: ${entry}`];
      if (Array.isArray(entry)) return entry.filter((item): item is string => typeof item === "string");
      return [];
    })
    .slice(0, 3);
  return statements.length ? statements.join(" ") : "Study this objective, then check understanding in tutor chat.";
}

function labelFromKey(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

async function appendReferenceRegeneratedEvent(ctx: AppContext, notebookId: string, kind: string, id: string): Promise<void> {
  await appendEvent(ctx.db, {
    notebookId,
    eventType: "reference.regenerated",
    payload: { kind, id, trigger: "reference_surface_regenerate" },
  });
}

async function generateStudyMarkdown(
  ctx: AppContext,
  input: { title: string; kind: string; currentMarkdown: string; sourceText: string; instruction?: string },
): Promise<{ markdown: string; mode: "ai" | "heuristic" }> {
  if (!ctx.env.OPENROUTER_API_KEY) {
    return { markdown: fallbackStudyMarkdown(input), mode: "heuristic" };
  }
  try {
    const base = ctx.env.OPENROUTER_BASE_URL.replace(/\/+$/, "");
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: ctx.env.DEFAULT_EXTRACTION_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: [
              "You regenerate StudyAgent learner-facing reference pages.",
              "Return only markdown. Do not write chatty prefaces.",
              "Make the page useful for studying directly: goal, explanation, examples, common mistakes, self-checks, and source-grounded notes.",
              formatGuidanceForKind(input.kind),
              "Preserve LaTeX formulas using $...$ for inline formulas and $$...$$ for display formulas.",
              "Use uploaded source excerpts when available. Mark missing evidence briefly instead of inventing citations.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `Target kind: ${input.kind}`,
              `Title: ${input.title}`,
              "",
              "Current page:",
              input.currentMarkdown.slice(0, 5000) || "(empty)",
              "",
              "Source excerpts:",
              input.sourceText || "(no excerpts available)",
              "",
              "Extra regeneration instruction:",
              input.instruction || "(none)",
            ].join("\n"),
          },
        ],
      }),
    });
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message ?? "OpenRouter error");
    const markdown = body.choices?.[0]?.message?.content?.trim();
    return markdown && markdown.length > 80
      ? { markdown, mode: "ai" }
      : { markdown: fallbackStudyMarkdown(input), mode: "heuristic" };
  } catch {
    return { markdown: fallbackStudyMarkdown(input), mode: "heuristic" };
  }
}

function fallbackStudyMarkdown(input: { title: string; kind: string; currentMarkdown: string; sourceText: string; instruction?: string }): string {
  const excerpt = input.sourceText.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 5);
  const artifactSpecific = fallbackFormatSections(input.kind, input.title);
  return [
    `# ${input.title}`,
    "",
    "## Learning goal",
    `Understand ${input.title} well enough to explain it, use it in practice, and connect it to the current notebook.`,
    input.instruction ? `\nInstruction used: ${input.instruction}` : "",
    "",
    "## Core explanation",
    input.currentMarkdown.trim() || excerpt[0] || "This page needs more source evidence. Ask the tutor to connect it to a specific uploaded source.",
    "",
    "## Source-grounded notes",
    ...(excerpt.length ? excerpt.map((line) => `- ${line}`) : ["- Needs source support."]),
    ...artifactSpecific,
    "",
    "## Common mistakes",
    "- Memorizing wording without checking how the idea is used.",
    "- Skipping assumptions, units, or prerequisite definitions.",
    "",
    "## Quick self-check",
    `- Define ${input.title} in your own words.`,
    `- Give one example where ${input.title} matters.`,
    "- Name one detail from the source that supports your explanation.",
  ].join("\n");
}

function formatGuidanceForKind(kind: string): string {
  if (kind === "curriculum") {
    return [
      "For a curriculum page, use this format:",
      "# Title",
      "## What you will be able to do",
      "## Prerequisite map",
      "## Module path",
      "Use a compact table with Module, Why it matters, Key concepts, Checkpoint.",
      "## How to study this source",
      "## Milestones and review cadence",
    ].join("\n");
  }
  if (kind === "module") {
    return [
      "For a module page, use this format:",
      "# Title",
      "## Module goal",
      "## Prerequisite refresh",
      "## Concept sequence",
      "## Worked example",
      "Use source-backed formulas in LaTeX when useful.",
      "## Practice ladder",
      "## Checkpoint",
      "## Recommended artifacts",
    ].join("\n");
  }
  if (kind === "objective_list") {
    return [
      "For an objective list, use this format:",
      "# Objective path",
      "## Ordered objectives",
      "Use a table with Step, Objective, Why now, Prerequisites, Mastery check.",
      "## Dependency notes",
      "## Checkpoint questions",
      "## What to ask the tutor next",
    ].join("\n");
  }
  if (kind === "objective") return "For an objective, include: measurable success criteria, prerequisite concepts, explanation, worked example, practice tasks, mastery checks, and one source-backed formula or definition if applicable.";
  if (kind === "session_plan") return "For a session plan, include: opener, diagnostic question, teaching arc, guided practice, misconception checks, exit ticket, and next action. Keep it immediately usable by a tutor.";
  if (kind.includes("flashcard")) return "For flashcards, create 10-14 high-quality cards grouped by Basic recall, Formula/notation, Application, and Confusion checks. Each card should have Front, Back, Why it matters, and Source clue.";
  if (kind.includes("quiz")) return "For quizzes, create 6-10 questions mixed across recall, application, and transfer. Include answer, explanation, difficulty, misconception tested, and source clue.";
  if (kind.includes("formula")) return "For formula sheets, group formulas by use case, render formulas in LaTeX, define variables and units, list assumptions, and add one worked substitution per major formula.";
  if (kind.includes("comparison")) return "For comparison pages, use a clear comparison table, when-to-use guidance, common confusion, and source-backed examples.";
  if (kind.includes("worked_example")) return "For worked examples, show setup, knowns/unknowns, assumptions, step-by-step solution with LaTeX formulas, sanity checks, and a nearby practice problem.";
  if (kind.includes("concept_card") || kind === "concept_wiki_page" || kind.startsWith("wiki_page:concept")) return "For concept pages, include: definition, intuition, formal details with LaTeX if needed, worked example, common confusions, source-backed notes, and quick self-check.";
  return "Choose the format that best helps a student study quickly: concise sections, examples, self-checks, and source-grounded notes.";
}

function fallbackFormatSections(kind: string, title: string): string[] {
  if (kind.includes("flashcard")) {
    return ["", "## Flashcards", `- Front: What is the central idea behind ${title}? Back: Explain it from the source in one or two sentences. Why it matters: It anchors later practice.`];
  }
  if (kind.includes("quiz")) {
    return ["", "## Practice questions", `1. Explain ${title} without looking at the notes.`, "2. Identify one source detail that supports your answer.", "3. Write one mistake a learner might make and correct it."];
  }
  if (kind === "curriculum") {
    return ["", "## Study path", "- Start with prerequisites, then work module by module.", "- After each module, answer a checkpoint question before moving on."];
  }
  if (kind === "module" || kind === "objective_list") {
    return ["", "## Practice ladder", "- Recall the definitions.", "- Solve a direct example.", "- Explain how this connects to the next objective."];
  }
  if (kind === "session_plan") {
    return ["", "## Session flow", "- Opener: quick recall.", "- Teach: source-backed explanation.", "- Practice: one guided problem.", "- Exit: one self-check."];
  }
  return [];
}

function firstParagraph(markdown: string): string {
  return markdown
    .replace(/^# .+$/m, "")
    .split(/\n{2,}/)
    .map((part) => part.replace(/^#+\s+/gm, "").trim())
    .find((part) => part.length > 0)
    ?.slice(0, 500) ?? "";
}

async function buildCurriculumOutlineReadModel(ctx: AppContext, notebookId: string, userId: string) {
  const [curriculum] = await ctx.db.db
    .select()
    .from(curricula)
    .where(and(eq(curricula.notebookId, notebookId), inArray(curricula.status, ["active", "published", "draft"])))
    .orderBy(desc(curricula.updatedAt))
    .limit(1);

  if (!curriculum) {
    return { curriculum: null, modules: [], orphanObjectives: [] };
  }

  const [plan] = await ctx.db.db
    .select()
    .from(studyPlans)
    .where(and(eq(studyPlans.notebookId, notebookId), eq(studyPlans.userId, userId)))
    .limit(1);

  const moduleRows = await ctx.db.db
    .select()
    .from(curriculumModules)
    .where(and(eq(curriculumModules.notebookId, notebookId), eq(curriculumModules.curriculumId, curriculum.id)))
    .orderBy(asc(curriculumModules.orderIndex));

  const objectiveRows = await ctx.db.db
    .select()
    .from(objectives)
    .where(and(eq(objectives.notebookId, notebookId), eq(objectives.curriculumId, curriculum.id)))
    .orderBy(asc(objectives.orderIndex));

  const objectiveListRows = await ctx.db.db
    .select()
    .from(objectiveLists)
    .where(and(eq(objectiveLists.notebookId, notebookId), eq(objectiveLists.curriculumId, curriculum.id)));

  const sessionPlanRows = await ctx.db.db
    .select()
    .from(sessionPlans)
    .where(and(eq(sessionPlans.notebookId, notebookId), eq(sessionPlans.curriculumId, curriculum.id)));

  const artifactRows = await ctx.db.db
    .select()
    .from(artifacts)
    .where(eq(artifacts.notebookId, notebookId))
    .limit(200);

  const completedObjectiveIds = new Set(plan?.completedObjectiveIds ?? []);
  const upcomingObjectiveIds = new Set(plan?.upcomingObjectiveIds ?? []);
  const currentObjectiveId = plan?.currentObjectiveId ?? null;
  const moduleObjectiveIds = new Map<string, string[]>();
  for (const list of objectiveListRows) {
    const ids = Array.isArray(list.objectiveIdsOrdered) ? list.objectiveIdsOrdered : [];
    const existing = moduleObjectiveIds.get(list.moduleId) ?? [];
    moduleObjectiveIds.set(list.moduleId, [...existing, ...ids]);
  }

  const sessionIdsByObjectiveId = new Map<string, string[]>();
  for (const sessionPlan of sessionPlanRows) {
    for (const objectiveId of sessionPlan.plannedObjectiveIds ?? []) {
      const list = sessionIdsByObjectiveId.get(objectiveId) ?? [];
      list.push(sessionPlan.id);
      sessionIdsByObjectiveId.set(objectiveId, list);
    }
  }

  const artifactIdsByObjectiveId = new Map<string, string[]>();
  for (const artifact of artifactRows) {
    const refs = Array.isArray(artifact.sourceNodeRefsJson) ? artifact.sourceNodeRefsJson : [];
    for (const ref of refs) {
      if (typeof ref !== "object" || ref === null) continue;
      const record = ref as Record<string, unknown>;
      const refId = typeof record.refId === "string" ? record.refId : typeof record.id === "string" ? record.id : null;
      const refType = typeof record.refType === "string" ? record.refType : typeof record.type === "string" ? record.type : null;
      if (refId && (!refType || refType === "objective")) {
        const list = artifactIdsByObjectiveId.get(refId) ?? [];
        list.push(artifact.id);
        artifactIdsByObjectiveId.set(refId, list);
      }
    }
  }

  const objectivesById = new Map(
    objectiveRows.map((objective) => [
      objective.id,
      {
        id: objective.id,
        title: objective.title,
        status: objective.id === currentObjectiveId
          ? "current"
          : completedObjectiveIds.has(objective.id)
            ? "completed"
            : upcomingObjectiveIds.has(objective.id)
              ? "upcoming"
              : objective.status,
        summary: null,
        artifactIds: artifactIdsByObjectiveId.get(objective.id) ?? [],
        sessionIds: sessionIdsByObjectiveId.get(objective.id) ?? [],
        conceptIds: [...(objective.prerequisiteConceptIds ?? []), ...(objective.targetConceptIds ?? [])],
        needsReview: isWeakPlanningLabel(objective.title),
      },
    ]),
  );

  const modules = moduleRows.map((module) => {
    const orderedIds = moduleObjectiveIds.get(module.id) ?? [];
    const moduleObjectives = orderedIds.map((id) => objectivesById.get(id)).filter((objective): objective is NonNullable<typeof objective> => Boolean(objective));
    return {
      id: module.id,
      title: module.title,
      status: module.status,
      summary: readablePlanningSummary(module.summary, module.title),
      objectives: moduleObjectives,
      needsReview: isWeakPlanningLabel(module.title),
    };
  });

  const assignedObjectiveIds = new Set(modules.flatMap((module) => module.objectives.map((objective) => objective.id)));
  const orphanObjectives = Array.from(objectivesById.values()).filter((objective) => !assignedObjectiveIds.has(objective.id));

  return {
    curriculum: {
      id: curriculum.id,
      title: curriculum.title,
      status: curriculum.status,
      summary: typeof curriculum.scopeJson?.summary === "string" ? curriculum.scopeJson.summary : null,
      needsReview: isWeakPlanningLabel(curriculum.title),
    },
    modules,
    orphanObjectives,
  };
}

function isWeakPlanningLabel(title: string): boolean {
  return (
    /^(objective|module|session)\s+\d+\b/i.test(title) ||
    /\b(current teaching session|active objective list|living study plan)\b/i.test(title) ||
    /^[a-z]+_[a-z0-9_]+$/i.test(title)
  );
}
