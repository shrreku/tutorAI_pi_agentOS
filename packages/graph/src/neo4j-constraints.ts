import type { Session } from "neo4j-driver";

/** Idempotent MVP constraints from `greenfield-studyagent/docs/10-neo4j-development-guide.md`. */
export async function ensureNeo4jMvpConstraints(session: Session): Promise<void> {
  const statements = [
    `CREATE CONSTRAINT studyagent_notebook_id IF NOT EXISTS FOR (n:Notebook) REQUIRE n.id IS UNIQUE`,
    `CREATE CONSTRAINT studyagent_source_id IF NOT EXISTS FOR (n:Source) REQUIRE n.id IS UNIQUE`,
    `CREATE CONSTRAINT studyagent_concept_id IF NOT EXISTS FOR (n:Concept) REQUIRE n.id IS UNIQUE`,
    `CREATE CONSTRAINT studyagent_curriculum_id IF NOT EXISTS FOR (n:Curriculum) REQUIRE n.id IS UNIQUE`,
    `CREATE CONSTRAINT studyagent_objective_id IF NOT EXISTS FOR (n:Objective) REQUIRE n.id IS UNIQUE`,
    `CREATE CONSTRAINT studyagent_study_plan_id IF NOT EXISTS FOR (n:StudyPlan) REQUIRE n.id IS UNIQUE`,
    `CREATE CONSTRAINT studyagent_claim_id IF NOT EXISTS FOR (n:Claim) REQUIRE n.id IS UNIQUE`,
    `CREATE CONSTRAINT studyagent_wiki_page_id IF NOT EXISTS FOR (n:WikiPage) REQUIRE n.id IS UNIQUE`,
    `CREATE INDEX studyagent_concept_notebook IF NOT EXISTS FOR (n:Concept) ON (n.notebookId)`,
    `CREATE INDEX studyagent_source_notebook IF NOT EXISTS FOR (n:Source) ON (n.notebookId)`,
    `CREATE INDEX studyagent_objective_notebook IF NOT EXISTS FOR (n:Objective) ON (n.notebookId, n.status)`,
  ];
  for (const cypher of statements) {
    await session.run(cypher);
  }
}
