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
}
