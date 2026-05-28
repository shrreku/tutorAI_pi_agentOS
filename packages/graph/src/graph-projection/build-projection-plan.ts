import type { IngestConceptRelationKind } from "../neo4j-projection.js";
import { graphRelationSemantics } from "../graph-semantics.js";
import type { CanonicalProjectionSnapshot, ProjectionOp, ProjectionPlan } from "./types.js";
import { stableTopicId, topicTitleForSource } from "./topic.js";

function asConceptRelationKind(relationType: string): IngestConceptRelationKind | null {
  const semantics = graphRelationSemantics(relationType);
  if (!semantics) return null;
  if (!["depends_on", "supports", "example_of", "contradicts", "covers"].includes(semantics.canonical)) return null;
  return semantics.canonical as IngestConceptRelationKind;
}

function curriculumForSource(snapshot: CanonicalProjectionSnapshot, sourceId: string) {
  return snapshot.curricula.find((c) => c.sourceIds.includes(sourceId));
}

function conceptsForSource(snapshot: CanonicalProjectionSnapshot, sourceId: string): Set<string> {
  const ids = new Set<string>();
  for (const claim of snapshot.claims) {
    if (claim.sourceId !== sourceId) continue;
    for (const conceptId of claim.conceptIds) ids.add(conceptId);
  }
  for (const page of snapshot.wikiPages) {
    if (page.linkedConceptId) ids.add(page.linkedConceptId);
  }
  return ids;
}

export function buildProjectionPlan(snapshot: CanonicalProjectionSnapshot): ProjectionPlan {
  const operations: ProjectionOp[] = [{ kind: "merge_notebook" }];
  const conceptIdsInScope = new Set(snapshot.concepts.map((c) => c.id));

  if (snapshot.scope === "source" && snapshot.sourceId) {
    const source = snapshot.sources.find((s) => s.id === snapshot.sourceId);
    if (!source) {
      return {
        notebookId: snapshot.notebookId,
        scope: snapshot.scope,
        ...(snapshot.sourceId ? { sourceId: snapshot.sourceId } : {}),
        operations,
      };
    }
    const curriculum = curriculumForSource(snapshot, source.id);
    const topicTitle = topicTitleForSource(source, curriculum);
    const topicId = stableTopicId(source.id, topicTitle);

    operations.push({ kind: "merge_source", sourceId: source.id, title: source.title });
    operations.push({ kind: "merge_topic", sourceId: source.id, topicId, title: topicTitle });

    const scopedConceptIds = conceptsForSource(snapshot, source.id);
    const scopedConcepts = snapshot.concepts
      .filter((c) => scopedConceptIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.canonicalName }));
    if (scopedConcepts.length) {
      operations.push({ kind: "merge_concepts", concepts: scopedConcepts });
      for (const concept of scopedConcepts) {
        operations.push({ kind: "link_topic_concept", sourceId: source.id, topicId, conceptId: concept.id });
      }
    }

    if (curriculum) {
      operations.push({ kind: "merge_curriculum", curriculumId: curriculum.id, title: curriculum.title });
      operations.push({ kind: "link_source_curriculum", sourceId: source.id, curriculumId: curriculum.id });
    }

    for (const mod of snapshot.modules.filter((m) => m.curriculumId === curriculum?.id)) {
      operations.push({ kind: "merge_module", module: mod });
    }
    for (const list of snapshot.objectiveLists.filter((l) => l.curriculumId === curriculum?.id)) {
      operations.push({ kind: "merge_objective_list", list });
    }
    for (const plan of snapshot.sessionPlans.filter((sp) => sp.curriculumId === curriculum?.id)) {
      operations.push({ kind: "merge_session_plan", plan });
    }
    const objectives = snapshot.objectives.filter((o) => o.curriculumId === curriculum?.id);
    for (const objective of objectives) {
      const list = snapshot.objectiveLists.find((l) => l.objectiveIdsOrdered.includes(objective.id));
      const sessionPlan = snapshot.sessionPlans.find((sp) => sp.objectiveListId === list?.id);
      operations.push({
        kind: "merge_objective",
        objective,
        objectiveListId: list?.id ?? null,
        sessionPlanId: sessionPlan?.id ?? null,
        orderIndex: objective.orderIndex,
      });
    }

    for (const claim of snapshot.claims.filter((c) => c.sourceId === source.id)) {
      operations.push({ kind: "merge_claim", claim });
    }
    for (const rel of snapshot.graphRelations) {
      if (rel.relationType === "supersedes" && rel.sourceNodeType === "claim") {
        operations.push({
          kind: "merge_claim_supersedes",
          winnerId: rel.sourceNodeId,
          supersededId: rel.targetNodeId,
        });
      } else if (rel.relationType === "contradicts" && rel.sourceNodeType === "claim") {
        operations.push({
          kind: "merge_claim_contradiction",
          claimIdA: rel.sourceNodeId,
          claimIdB: rel.targetNodeId,
        });
      } else if (rel.sourceNodeType === "concept" && rel.targetNodeType === "concept") {
        const kind = asConceptRelationKind(rel.relationType);
        if (!kind) continue;
        if (!scopedConceptIds.has(rel.sourceNodeId) || !scopedConceptIds.has(rel.targetNodeId)) continue;
        operations.push({
          kind: "merge_concept_relation",
          fromId: rel.sourceNodeId,
          toId: rel.targetNodeId,
          relationKind: kind,
          confidence: rel.confidence,
          sourceId: source.id,
        });
      }
    }

    for (const page of snapshot.wikiPages) {
      const pageSourceId = page.sourceId ?? inferWikiPageSourceId(page, source.id);
      if (pageSourceId !== source.id) continue;
      operations.push({ kind: "merge_wiki_page", page });
      operations.push({ kind: "link_wiki_source", pageId: page.id, sourceId: source.id });
      operations.push({ kind: "link_topic_wiki_page", sourceId: source.id, topicId, pageId: page.id });
    }

    return {
      notebookId: snapshot.notebookId,
      scope: snapshot.scope,
      ...(snapshot.sourceId ? { sourceId: snapshot.sourceId } : {}),
      operations,
    };
  }

  for (const source of snapshot.sources) {
    const curriculum = curriculumForSource(snapshot, source.id);
    const topicTitle = topicTitleForSource(source, curriculum);
    const topicId = stableTopicId(source.id, topicTitle);
    operations.push({ kind: "merge_source", sourceId: source.id, title: source.title });
    operations.push({ kind: "merge_topic", sourceId: source.id, topicId, title: topicTitle });

    const scopedConceptIds = conceptsForSource(snapshot, source.id);
    for (const conceptId of scopedConceptIds) {
      if (!conceptIdsInScope.has(conceptId)) continue;
      operations.push({ kind: "link_topic_concept", sourceId: source.id, topicId, conceptId });
    }
  }

  if (snapshot.concepts.length) {
    operations.push({
      kind: "merge_concepts",
      concepts: snapshot.concepts.map((c) => ({ id: c.id, name: c.canonicalName })),
    });
  }

  for (const rel of snapshot.graphRelations) {
    if (rel.sourceNodeType === "concept" && rel.targetNodeType === "concept") {
      const kind = asConceptRelationKind(rel.relationType);
      if (!kind) continue;
      operations.push({
        kind: "merge_concept_relation",
        fromId: rel.sourceNodeId,
        toId: rel.targetNodeId,
        relationKind: kind,
        confidence: rel.confidence,
      });
    }
  }

  for (const curriculum of snapshot.curricula) {
    operations.push({ kind: "merge_curriculum", curriculumId: curriculum.id, title: curriculum.title });
    for (const sourceId of curriculum.sourceIds) {
      if (snapshot.sources.some((s) => s.id === sourceId)) {
        operations.push({ kind: "link_source_curriculum", sourceId, curriculumId: curriculum.id });
      }
    }
  }

  for (const mod of snapshot.modules) {
    operations.push({ kind: "merge_module", module: mod });
  }
  for (const list of snapshot.objectiveLists) {
    operations.push({ kind: "merge_objective_list", list });
  }
  for (const plan of snapshot.sessionPlans) {
    operations.push({ kind: "merge_session_plan", plan });
  }
  for (const objective of snapshot.objectives) {
    const list = snapshot.objectiveLists.find((l) => l.objectiveIdsOrdered.includes(objective.id));
    const sessionPlan = snapshot.sessionPlans.find((sp) => sp.objectiveListId === list?.id);
    operations.push({
      kind: "merge_objective",
      objective,
      objectiveListId: list?.id ?? null,
      sessionPlanId: sessionPlan?.id ?? null,
      orderIndex: objective.orderIndex,
    });
  }

  for (const plan of snapshot.studyPlans) {
    const objectiveIds = [
      ...(plan.currentObjectiveId ? [plan.currentObjectiveId] : []),
      ...plan.upcomingObjectiveIds,
    ].filter((id, index, arr) => arr.indexOf(id) === index);
    operations.push({
      kind: "merge_study_plan",
      planId: plan.id,
      title: plan.title,
      objectiveIds,
      currentObjectiveId: plan.currentObjectiveId,
    });
  }

  for (const item of snapshot.coverageItems) {
    operations.push({ kind: "merge_coverage_item", item });
  }
  for (const record of snapshot.coverageRecords) {
    operations.push({ kind: "merge_coverage_record", record });
  }

  for (const claim of snapshot.claims) {
    operations.push({ kind: "merge_claim", claim });
  }
  for (const rel of snapshot.graphRelations) {
    if (rel.relationType === "supersedes" && rel.sourceNodeType === "claim") {
      operations.push({
        kind: "merge_claim_supersedes",
        winnerId: rel.sourceNodeId,
        supersededId: rel.targetNodeId,
      });
    } else if (rel.relationType === "contradicts" && rel.sourceNodeType === "claim") {
      operations.push({
        kind: "merge_claim_contradiction",
        claimIdA: rel.sourceNodeId,
        claimIdB: rel.targetNodeId,
      });
    }
  }

  for (const page of snapshot.wikiPages) {
    operations.push({ kind: "merge_wiki_page", page });
    const sourceId = page.sourceId ?? inferWikiPageSourceId(page, snapshot.sources[0]?.id ?? "");
    if (sourceId && snapshot.sources.some((s) => s.id === sourceId)) {
      operations.push({ kind: "link_wiki_source", pageId: page.id, sourceId });
      const topicId = stableTopicId(sourceId, topicTitleForSource(snapshot.sources.find((s) => s.id === sourceId)!, curriculumForSource(snapshot, sourceId)));
      operations.push({ kind: "link_topic_wiki_page", sourceId, topicId, pageId: page.id });
    }
  }

  return {
    notebookId: snapshot.notebookId,
    scope: snapshot.scope,
    ...(snapshot.sourceId ? { sourceId: snapshot.sourceId } : {}),
    operations,
  };
}

function inferWikiPageSourceId(
  page: { pageType: string; pageKey: string },
  fallbackSourceId: string,
): string | null {
  if (page.pageType === "source_summary" || page.pageType === "topic") return fallbackSourceId || null;
  return null;
}
