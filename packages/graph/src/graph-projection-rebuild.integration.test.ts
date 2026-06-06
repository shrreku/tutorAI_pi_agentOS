import neo4j, { type Driver, type Session } from "neo4j-driver";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyProjectionPlan } from "./graph-projection/apply-projection-plan.js";
import { buildProjectionPlan } from "./graph-projection/build-projection-plan.js";
import { clearSourceProjectionScope } from "./graph-projection/clear-projection-scope.js";
import type { CanonicalProjectionSnapshot } from "./graph-projection/types.js";

const NEO4J_URI = process.env.NEO4J_URI ?? "bolt://localhost:7687";
const NEO4J_USERNAME = process.env.NEO4J_USERNAME ?? "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? "studyagent-local";

function canonicalSnapshot(notebookId: string, sourceId: string, conceptId: string): CanonicalProjectionSnapshot {
  return {
    notebookId,
    scope: "source",
    sourceId,
    sources: [{ id: sourceId, title: "Physics" }],
    concepts: [{ id: conceptId, canonicalName: "Force" }],
    claims: [{ id: `clm_${conceptId}`, sourceId, claimText: "F = ma", conceptIds: [conceptId] }],
    wikiPages: [],
    graphRelations: [],
    curricula: [],
    modules: [],
    objectiveLists: [],
    sessionPlans: [],
    objectives: [],
    studyPlans: [],
    coverageItems: [],
    coverageRecords: [],
  };
}

async function countNodes(session: Session, label: string, notebookId: string): Promise<number> {
  const result = await session.run(
    `MATCH (n:${label}) WHERE n.notebookId = $notebookId RETURN count(n) AS count`,
    { notebookId },
  );
  return Number(result.records[0]?.get("count") ?? 0);
}

describe("Neo4j projection rebuild integration", () => {
  let driver: Driver | undefined;
  let session: Session | undefined;
  let connected = false;
  const notebookId = `nb_rebuild_int_${Date.now()}`;
  const sourceId = `src_rebuild_int_${Date.now()}`;
  const conceptId = `cnc_shared_${Date.now()}`;
  const shouldAttempt = process.env.RUN_NEO4J_INTEGRATION === "1";

  beforeAll(async () => {
    if (!shouldAttempt || process.env.SKIP_NEO4J_INTEGRATION === "1") return;
    try {
      driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD));
      await Promise.race([
        driver.verifyConnectivity(),
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("Neo4j connectivity timed out")), 3_000);
        }),
      ]);
      session = driver.session();
      connected = true;
    } catch {
      connected = false;
    }
  }, 10_000);

  afterAll(async () => {
    if (session && connected) {
      await session.run(
        `MATCH (n) WHERE n.notebookId = $notebookId DETACH DELETE n`,
        { notebookId },
      );
      await session.close();
    }
    if (driver) await driver.close();
  });

  it("removes stale source-owned projection while preserving shared Concept nodes", async () => {
    if (!shouldAttempt || !connected || !session) return;

    await session.run(
      `CREATE (n:Notebook {id: $notebookId, notebookId: $notebookId})
       CREATE (s:Source {id: $sourceId, notebookId: $notebookId, sourceId: $sourceId, title: "Physics"})
       CREATE (c:Concept {id: $conceptId, notebookId: $notebookId, canonicalName: "Force"})
       CREATE (stale:Topic {id: $topicId, notebookId: $notebookId, sourceId: $sourceId, title: "Stale Topic"})
       CREATE (s)-[:HAS_TOPIC]->(stale)`,
      { notebookId, sourceId, conceptId, topicId: `topic_stale_${Date.now()}` },
    );

    expect(await countNodes(session, "Topic", notebookId)).toBe(1);
    expect(await countNodes(session, "Concept", notebookId)).toBe(1);

    await clearSourceProjectionScope(session, notebookId, sourceId);

    expect(await countNodes(session, "Topic", notebookId)).toBe(0);
    expect(await countNodes(session, "Concept", notebookId)).toBe(1);

    const plan = buildProjectionPlan(canonicalSnapshot(notebookId, sourceId, conceptId));
    await applyProjectionPlan(session, plan);

    expect(await countNodes(session, "Source", notebookId)).toBeGreaterThanOrEqual(1);
    expect(await countNodes(session, "Claim", notebookId)).toBeGreaterThanOrEqual(1);
    expect(await countNodes(session, "Concept", notebookId)).toBe(1);
  }, 30_000);
});
