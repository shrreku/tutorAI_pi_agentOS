import type { Session } from "neo4j-driver";

export async function clearNotebookProjectionScope(session: Session, notebookId: string): Promise<void> {
  await session.run(
    `MATCH (n)
     WHERE n.notebookId = $notebookId AND NOT n:Notebook
     DETACH DELETE n`,
    { notebookId },
  );
}

export async function clearSourceProjectionScope(
  session: Session,
  notebookId: string,
  sourceId: string,
): Promise<void> {
  await session.run(
    `MATCH (s:Source {id: $sourceId})-[:COVERS]->(cur:Curriculum)
     WHERE s.notebookId = $notebookId AND cur.notebookId = $notebookId
     OPTIONAL MATCH (cur)-[:CONTAINS|PLANS*0..4]->(owned)
     WHERE owned.notebookId = $notebookId
       AND (owned:curriculum_module OR owned:objective_list OR owned:session_plan OR owned:Objective OR owned:CoverageItem OR owned:CoverageRecord)
     DETACH DELETE owned, cur`,
    { sourceId, notebookId },
  );
  await session.run(
    `MATCH ()-[r]-()
     WHERE r.notebookId = $notebookId
       AND (r.sourceId = $sourceId OR r.projectionSourceId = $sourceId)
     DELETE r`,
    { sourceId, notebookId },
  );
  await session.run(
    `MATCH (s:Source {id: $sourceId})
     WHERE s.notebookId = $notebookId
     OPTIONAL MATCH (s)-[:HAS_TOPIC]->(t:Topic)
     DETACH DELETE t`,
    { sourceId, notebookId },
  );
  await session.run(
    `MATCH (cl:Claim)-[:DERIVED_FROM]->(s:Source {id: $sourceId})
     WHERE cl.notebookId = $notebookId AND s.notebookId = $notebookId
     DETACH DELETE cl`,
    { sourceId, notebookId },
  );
  await session.run(
    `MATCH (w:WikiPage)-[:DERIVED_FROM]->(s:Source {id: $sourceId})
     WHERE w.notebookId = $notebookId AND s.notebookId = $notebookId
     DETACH DELETE w`,
    { sourceId, notebookId },
  );
  await session.run(
    `MATCH (n)
     WHERE n.notebookId = $notebookId
       AND n.sourceId = $sourceId
       AND NOT n:Source
       AND NOT n:Concept
     DETACH DELETE n`,
    { sourceId, notebookId },
  );
}
