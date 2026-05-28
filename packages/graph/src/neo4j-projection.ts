import neo4j, { type Driver, type Session } from "neo4j-driver";
import { ensureNeo4jMvpConstraints } from "./neo4j-constraints.js";

export { ensureNeo4jMvpConstraints } from "./neo4j-constraints.js";

export function createNeo4jDriver(uri: string, username: string, password: string): Driver {
  return neo4j.driver(uri, neo4j.auth.basic(username, password));
}

export async function mergeNotebookNode(session: Session, notebookId: string): Promise<void> {
  await session.run(
    `MERGE (n:Notebook {id: $notebookId})
     SET n.updatedAt = datetime()`,
    { notebookId },
  );
}

export async function mergeConceptNodes(
  session: Session,
  notebookId: string,
  concepts: Array<{ id: string; name: string }>,
): Promise<void> {
  await mergeNotebookNode(session, notebookId);
  for (const c of concepts) {
    await session.run(
      `MATCH (n:Notebook {id: $notebookId})
       MERGE (x:Concept {id: $id})
       SET x.name = $name,
           x.notebookId = $notebookId,
           x.status = coalesce(x.status, 'active'),
           x.updatedAt = datetime()
       MERGE (n)-[:HAS_CONCEPT]->(x)`,
      { id: c.id, name: c.name, notebookId },
    );
  }
}

export type IngestConceptRelationKind = "depends_on" | "supports" | "example_of" | "contradicts" | "covers";

export async function mergeConceptRelation(
  session: Session,
  notebookId: string,
  fromConceptId: string,
  toConceptId: string,
  kind: IngestConceptRelationKind,
  confidence: number | null,
  sourceId?: string,
): Promise<void> {
  const conf = confidence ?? undefined;
  if (kind === "depends_on") {
    await session.run(
      `MATCH (a:Concept {id: $fromId}), (b:Concept {id: $toId})
       WHERE a.notebookId = $notebookId AND b.notebookId = $notebookId
       MERGE (a)-[r:DEPENDS_ON]->(b)
       SET r.notebookId = $notebookId,
           r.confidence = coalesce($confidence, r.confidence),
           r.projectionSourceId = coalesce($sourceId, r.projectionSourceId),
           r.updatedAt = datetime()`,
      { fromId: fromConceptId, toId: toConceptId, notebookId, confidence: conf ?? null, sourceId: sourceId ?? null },
    );
    return;
  }
  if (kind === "contradicts") {
    await session.run(
      `MATCH (a:Concept {id: $fromId}), (b:Concept {id: $toId})
       WHERE a.notebookId = $notebookId AND b.notebookId = $notebookId
       MERGE (a)-[r:CONTRADICTS]->(b)
       SET r.notebookId = $notebookId,
           r.confidence = coalesce($confidence, r.confidence),
           r.projectionSourceId = coalesce($sourceId, r.projectionSourceId),
           r.updatedAt = datetime()`,
      { fromId: fromConceptId, toId: toConceptId, notebookId, confidence: conf ?? null, sourceId: sourceId ?? null },
    );
    return;
  }
  if (kind === "example_of") {
    await session.run(
      `MATCH (a:Concept {id: $fromId}), (b:Concept {id: $toId})
       WHERE a.notebookId = $notebookId AND b.notebookId = $notebookId
       MERGE (a)-[r:DERIVED_FROM]->(b)
       SET r.notebookId = $notebookId,
           r.variant = 'example_of',
           r.confidence = coalesce($confidence, r.confidence),
           r.projectionSourceId = coalesce($sourceId, r.projectionSourceId),
           r.updatedAt = datetime()`,
      { fromId: fromConceptId, toId: toConceptId, notebookId, confidence: conf ?? null, sourceId: sourceId ?? null },
    );
    return;
  }
  const variant = kind === "supports" ? "supports" : "covers";
  await session.run(
    `MATCH (a:Concept {id: $fromId}), (b:Concept {id: $toId})
     WHERE a.notebookId = $notebookId AND b.notebookId = $notebookId
     MERGE (a)-[r:COVERS]->(b)
     SET r.notebookId = $notebookId,
         r.variant = $variant,
         r.confidence = coalesce($confidence, r.confidence),
         r.projectionSourceId = coalesce($sourceId, r.projectionSourceId),
         r.updatedAt = datetime()`,
    { fromId: fromConceptId, toId: toConceptId, notebookId, variant, confidence: conf ?? null, sourceId: sourceId ?? null },
  );
}

export async function mergeSourceNode(
  session: Session,
  notebookId: string,
  sourceId: string,
  title: string,
): Promise<void> {
  await mergeNotebookNode(session, notebookId);
  await session.run(
    `MERGE (s:Source {id: $sourceId})
     SET s.notebookId = $notebookId,
         s.title = $title,
         s.updatedAt = datetime()`,
    { sourceId, notebookId, title },
  );
}

export async function mergeTopicNode(
  session: Session,
  notebookId: string,
  sourceId: string,
  topicId: string,
  title: string,
): Promise<void> {
  await session.run(
    `MATCH (s:Source {id: $sourceId})
     WHERE s.notebookId = $notebookId
     MERGE (t:Topic {id: $topicId})
     SET t.notebookId = $notebookId,
         t.sourceId = $sourceId,
         t.title = $title,
         t.updatedAt = datetime()
     MERGE (s)-[r:HAS_TOPIC]->(t)
     SET r.notebookId = $notebookId,
         r.updatedAt = datetime()`,
    { notebookId, sourceId, topicId, title },
  );
}

export async function linkTopicToConcept(
  session: Session,
  notebookId: string,
  topicId: string,
  conceptId: string,
): Promise<void> {
  await session.run(
    `MATCH (t:Topic {id: $topicId}), (c:Concept {id: $conceptId})
     WHERE t.notebookId = $notebookId AND c.notebookId = $notebookId
     MERGE (t)-[r:CONTAINS_CONCEPT]->(c)
     SET r.notebookId = $notebookId,
         r.updatedAt = datetime()`,
    { notebookId, topicId, conceptId },
  );
}

export async function linkTopicToWikiPage(
  session: Session,
  notebookId: string,
  topicId: string,
  pageId: string,
): Promise<void> {
  await session.run(
    `MATCH (t:Topic {id: $topicId}), (w:WikiPage {id: $pageId})
     WHERE t.notebookId = $notebookId AND w.notebookId = $notebookId
     MERGE (t)-[r:CONTAINS_PAGE]->(w)
     SET r.notebookId = $notebookId,
         r.updatedAt = datetime()`,
    { notebookId, topicId, pageId },
  );
}

export async function mergeCurriculumNode(
  session: Session,
  notebookId: string,
  curriculumId: string,
  title: string,
): Promise<void> {
  await mergeNotebookNode(session, notebookId);
  await session.run(
    `MERGE (c:Curriculum {id: $curriculumId})
     SET c.notebookId = $notebookId,
         c.title = $title,
         c.status = coalesce(c.status, 'draft'),
         c.updatedAt = datetime()`,
    { curriculumId, notebookId, title },
  );
}

export async function mergeCurriculumModuleNode(
  session: Session,
  notebookId: string,
  moduleId: string,
  curriculumId: string,
  title: string,
  summary: string | null,
  orderIndex: number,
  status: string,
): Promise<void> {
  await session.run(
    `MERGE (m:curriculum_module {id: $moduleId})
     SET m.notebookId = $notebookId,
         m.curriculumId = $curriculumId,
         m.title = $title,
         m.summary = $summary,
         m.orderIndex = $orderIndex,
         m.status = $status,
         m.updatedAt = datetime()
     WITH m
     MATCH (cur:Curriculum {id: $curriculumId})
     WHERE cur.notebookId = $notebookId
     MERGE (cur)-[x:CONTAINS]->(m)
     SET x.notebookId = $notebookId,
         x.orderIndex = $orderIndex,
         x.updatedAt = datetime()`,
    { moduleId, curriculumId, notebookId, title, summary, orderIndex, status },
  );
}

export async function mergeObjectiveListNode(
  session: Session,
  notebookId: string,
  objectiveListId: string,
  curriculumId: string,
  moduleId: string,
  title: string,
  status: string,
): Promise<void> {
  await session.run(
    `MERGE (ol:objective_list {id: $objectiveListId})
     SET ol.notebookId = $notebookId,
         ol.curriculumId = $curriculumId,
         ol.moduleId = $moduleId,
         ol.title = $title,
         ol.status = $status,
         ol.updatedAt = datetime()
     WITH ol
     MATCH (m:curriculum_module {id: $moduleId})
     WHERE m.notebookId = $notebookId
     MERGE (m)-[x:CONTAINS]->(ol)
     SET x.notebookId = $notebookId,
         x.updatedAt = datetime()`,
    { objectiveListId, curriculumId, moduleId, notebookId, title, status },
  );
}

export async function mergeSessionPlanNode(
  session: Session,
  notebookId: string,
  sessionPlanId: string,
  curriculumId: string,
  moduleId: string,
  objectiveListId: string,
  title: string,
  status: string,
  sessionGoal: string | null,
): Promise<void> {
  await session.run(
    `MERGE (sp:session_plan {id: $sessionPlanId})
     SET sp.notebookId = $notebookId,
         sp.curriculumId = $curriculumId,
         sp.moduleId = $moduleId,
         sp.objectiveListId = $objectiveListId,
         sp.title = $title,
         sp.status = $status,
         sp.sessionGoal = $sessionGoal,
         sp.updatedAt = datetime()
     WITH sp
     MATCH (ol:objective_list {id: $objectiveListId})
     WHERE ol.notebookId = $notebookId
     MERGE (ol)-[x:PLANS]->(sp)
     SET x.notebookId = $notebookId,
         x.updatedAt = datetime()`,
    { sessionPlanId, curriculumId, moduleId, objectiveListId, notebookId, title, status, sessionGoal },
  );
}

export async function mergeCoverageItemNode(
  session: Session,
  notebookId: string,
  coverageItemId: string,
  title: string,
  itemFamily: string,
): Promise<void> {
  await session.run(
    `MERGE (c:coverage_item {id: $coverageItemId})
     SET c.notebookId = $notebookId,
         c.title = $title,
         c.itemFamily = $itemFamily,
         c.updatedAt = datetime()`,
    { coverageItemId, notebookId, title, itemFamily },
  );
}

export async function mergeCoverageRecordNode(
  session: Session,
  notebookId: string,
  coverageRecordId: string,
  coverageItemId: string,
  status: string,
): Promise<void> {
  await session.run(
    `MERGE (r:coverage_record {id: $coverageRecordId})
     SET r.notebookId = $notebookId,
         r.coverageItemId = $coverageItemId,
         r.status = $status,
         r.updatedAt = datetime()
     WITH r
     MATCH (c:coverage_item {id: $coverageItemId})
     WHERE c.notebookId = $notebookId
     MERGE (r)-[x:COVERS]->(c)
     SET x.notebookId = $notebookId,
         x.updatedAt = datetime()`,
    { coverageRecordId, coverageItemId, notebookId, status },
  );
}

export async function mergeObjectiveNode(
  session: Session,
  notebookId: string,
  curriculumId: string,
  objectiveId: string,
  title: string,
  orderIndex: number,
  status: string,
): Promise<void> {
  await session.run(
    `MERGE (o:Objective {id: $objectiveId})
     SET o.notebookId = $notebookId,
         o.title = $title,
         o.orderIndex = $orderIndex,
         o.status = $status,
         o.updatedAt = datetime()
     WITH o
     MATCH (cur:Curriculum {id: $curriculumId})
     WHERE cur.notebookId = $notebookId
     MERGE (cur)-[x:CONTAINS]->(o)
     SET x.notebookId = $notebookId,
         x.orderIndex = $orderIndex,
         x.updatedAt = datetime()`,
    { objectiveId, curriculumId, notebookId, title, orderIndex, status },
  );
}

export async function linkSourceCoversCurriculum(
  session: Session,
  notebookId: string,
  sourceId: string,
  curriculumId: string,
): Promise<void> {
  await session.run(
    `MATCH (s:Source {id: $sourceId}), (cur:Curriculum {id: $curriculumId})
     WHERE s.notebookId = $notebookId AND cur.notebookId = $notebookId
     MERGE (s)-[r:COVERS]->(cur)
     SET r.notebookId = $notebookId,
         r.updatedAt = datetime()`,
    { sourceId, curriculumId, notebookId },
  );
}

export async function mergeStudyPlanAndObjectives(
  session: Session,
  notebookId: string,
  planId: string,
  title: string,
  objectiveIdsInOrder: string[],
  currentObjectiveId: string | null,
): Promise<void> {
  await mergeNotebookNode(session, notebookId);
  await session.run(
    `MERGE (p:StudyPlan {id: $planId})
     SET p.notebookId = $notebookId,
         p.title = $title,
         p.updatedAt = datetime()`,
    { planId, notebookId, title },
  );

  for (const oid of objectiveIdsInOrder) {
    const slot = oid === currentObjectiveId ? "current" : "queued";
    await session.run(
      `MATCH (p:StudyPlan {id: $planId}), (o:Objective {id: $oid})
       WHERE p.notebookId = $notebookId AND o.notebookId = $notebookId
       MERGE (p)-[r:COVERS]->(o)
       SET r.slot = $slot,
           r.notebookId = $notebookId,
           r.updatedAt = datetime()`,
      { planId, oid, notebookId, slot },
    );
  }

  for (let i = 0; i < objectiveIdsInOrder.length - 1; i += 1) {
    const a = objectiveIdsInOrder[i]!;
    const b = objectiveIdsInOrder[i + 1]!;
    await session.run(
      `MATCH (o1:Objective {id: $a}), (o2:Objective {id: $b})
       WHERE o1.notebookId = $notebookId AND o2.notebookId = $notebookId
       MERGE (o1)-[r:NEXT_OBJECTIVE]->(o2)
       SET r.notebookId = $notebookId,
           r.updatedAt = datetime()`,
      { a, b, notebookId },
    );
  }
}

export async function mergeClaimContradiction(
  session: Session,
  notebookId: string,
  claimIdA: string,
  claimIdB: string,
): Promise<void> {
  await session.run(
    `MATCH (a:Claim {id: $a}), (b:Claim {id: $b})
     WHERE a.notebookId = $notebookId AND b.notebookId = $notebookId
     MERGE (a)-[r:CONTRADICTS]->(b)
     SET r.notebookId = $notebookId,
         r.updatedAt = datetime()`,
    { a: claimIdA, b: claimIdB, notebookId },
  );
}

export async function mergeClaimSupersedes(
  session: Session,
  notebookId: string,
  winnerClaimId: string,
  supersededClaimId: string,
): Promise<void> {
  await session.run(
    `MATCH (w:Claim {id: $winner}), (s:Claim {id: $loser})
     WHERE w.notebookId = $notebookId AND s.notebookId = $notebookId
     MERGE (w)-[r:SUPERSEDES]->(s)
     SET r.notebookId = $notebookId,
         r.updatedAt = datetime()`,
    { winner: winnerClaimId, loser: supersededClaimId, notebookId },
  );
}

export async function mergeClaimNode(
  session: Session,
  notebookId: string,
  claimId: string,
  summary: string,
  sourceId: string,
  primaryConceptId: string | null,
): Promise<void> {
  await session.run(
    `MERGE (cl:Claim {id: $claimId})
     SET cl.notebookId = $notebookId,
         cl.summary = $summary,
         cl.updatedAt = datetime()`,
    { claimId, notebookId, summary },
  );
  await session.run(
    `MATCH (cl:Claim {id: $claimId}), (s:Source {id: $sourceId})
     WHERE cl.notebookId = $notebookId AND s.notebookId = $notebookId
     MERGE (cl)-[r:DERIVED_FROM]->(s)
     SET r.notebookId = $notebookId,
         r.updatedAt = datetime()`,
    { claimId, sourceId, notebookId },
  );
  if (primaryConceptId) {
    await session.run(
      `MATCH (c:Concept {id: $conceptId}), (cl:Claim {id: $claimId})
       WHERE c.notebookId = $notebookId AND cl.notebookId = $notebookId
       MERGE (c)-[r:CITES]->(cl)
       SET r.notebookId = $notebookId,
           r.updatedAt = datetime()`,
      { conceptId: primaryConceptId, claimId, notebookId },
    );
  }
}

export async function mergeWikiPageNode(
  session: Session,
  notebookId: string,
  pageId: string,
  title: string,
  pageKey: string,
  pageType: string,
  linkedConceptId: string | null,
): Promise<void> {
  await session.run(
    `MERGE (w:WikiPage {id: $pageId})
     SET w.notebookId = $notebookId,
         w.title = $title,
         w.pageKey = $pageKey,
         w.pageType = $pageType,
         w.updatedAt = datetime()`,
    { pageId, notebookId, title, pageKey, pageType },
  );
  if (linkedConceptId) {
    await session.run(
      `MATCH (w:WikiPage {id: $pageId}), (c:Concept {id: $conceptId})
       WHERE w.notebookId = $notebookId AND c.notebookId = $notebookId
       MERGE (w)-[r:COVERS]->(c)
       SET r.notebookId = $notebookId,
           r.updatedAt = datetime()`,
      { pageId, conceptId: linkedConceptId, notebookId },
    );
  }
}

export async function mergeWikiPageForSource(
  session: Session,
  notebookId: string,
  pageId: string,
  sourceId: string,
): Promise<void> {
  await session.run(
    `MATCH (w:WikiPage {id: $pageId}), (s:Source {id: $sourceId})
     WHERE w.notebookId = $notebookId AND s.notebookId = $notebookId
     MERGE (w)-[r:DERIVED_FROM]->(s)
     SET r.notebookId = $notebookId,
         r.updatedAt = datetime()`,
    { pageId, sourceId, notebookId },
  );
}

/** Bootstrap constraints and verify read access. */
export async function verifyNeo4jProjection(session: Session): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await ensureNeo4jMvpConstraints(session);
    await session.run(`RETURN 1 AS ok`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
