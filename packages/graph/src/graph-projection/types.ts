import type { IngestConceptRelationKind } from "../neo4j-projection.js";

export type CanonicalConcept = {
  id: string;
  canonicalName: string;
};

export type CanonicalSource = {
  id: string;
  title: string;
};

export type CanonicalClaim = {
  id: string;
  sourceId: string;
  claimText: string;
  conceptIds: string[];
};

export type CanonicalWikiPage = {
  id: string;
  pageType: string;
  pageKey: string;
  title: string;
  linkedConceptId: string | null;
  sourceId: string | null;
};

export type CanonicalGraphRelation = {
  sourceNodeType: string;
  sourceNodeId: string;
  targetNodeType: string;
  targetNodeId: string;
  relationType: string;
  confidence: number | null;
};

export type CanonicalCurriculum = {
  id: string;
  title: string;
  sourceIds: string[];
};

export type CanonicalModule = {
  id: string;
  curriculumId: string;
  title: string;
  summary: string | null;
  orderIndex: number;
  status: string;
};

export type CanonicalObjectiveList = {
  id: string;
  curriculumId: string;
  moduleId: string;
  title: string;
  status: string;
  objectiveIdsOrdered: string[];
};

export type CanonicalSessionPlan = {
  id: string;
  curriculumId: string;
  moduleId: string;
  objectiveListId: string;
  title: string;
  status: string;
  sessionGoal: string | null;
};

export type CanonicalObjective = {
  id: string;
  curriculumId: string;
  title: string;
  orderIndex: number;
  status: string;
};

export type CanonicalStudyPlan = {
  id: string;
  title: string;
  currentObjectiveId: string | null;
  upcomingObjectiveIds: string[];
};

export type CanonicalCoverageItem = {
  id: string;
  sourceId: string | null;
  title: string;
  itemFamily: string;
};

export type CanonicalCoverageRecord = {
  id: string;
  coverageItemId: string;
  status: string;
};

export type CanonicalProjectionSnapshot = {
  notebookId: string;
  scope: "notebook" | "source";
  sourceId?: string | undefined;
  sources: CanonicalSource[];
  concepts: CanonicalConcept[];
  claims: CanonicalClaim[];
  wikiPages: CanonicalWikiPage[];
  graphRelations: CanonicalGraphRelation[];
  curricula: CanonicalCurriculum[];
  modules: CanonicalModule[];
  objectiveLists: CanonicalObjectiveList[];
  sessionPlans: CanonicalSessionPlan[];
  objectives: CanonicalObjective[];
  studyPlans: CanonicalStudyPlan[];
  coverageItems: CanonicalCoverageItem[];
  coverageRecords: CanonicalCoverageRecord[];
};

export type ProjectionOp =
  | { kind: "merge_notebook" }
  | { kind: "merge_source"; sourceId: string; title: string }
  | { kind: "merge_topic"; sourceId: string; topicId: string; title: string }
  | { kind: "merge_concepts"; concepts: Array<{ id: string; name: string }> }
  | { kind: "link_topic_concept"; sourceId: string; topicId: string; conceptId: string }
  | { kind: "merge_concept_relation"; fromId: string; toId: string; relationKind: IngestConceptRelationKind; confidence: number | null }
  | { kind: "merge_curriculum"; curriculumId: string; title: string }
  | { kind: "link_source_curriculum"; sourceId: string; curriculumId: string }
  | { kind: "merge_module"; module: CanonicalModule }
  | { kind: "merge_objective_list"; list: CanonicalObjectiveList }
  | { kind: "merge_session_plan"; plan: CanonicalSessionPlan }
  | { kind: "merge_objective"; objective: CanonicalObjective; objectiveListId: string | null; sessionPlanId: string | null; orderIndex: number }
  | { kind: "merge_study_plan"; planId: string; title: string; objectiveIds: string[]; currentObjectiveId: string | null }
  | { kind: "merge_coverage_item"; item: CanonicalCoverageItem }
  | { kind: "merge_coverage_record"; record: CanonicalCoverageRecord }
  | { kind: "merge_claim"; claim: CanonicalClaim }
  | { kind: "merge_claim_supersedes"; winnerId: string; supersededId: string }
  | { kind: "merge_claim_contradiction"; claimIdA: string; claimIdB: string }
  | { kind: "merge_wiki_page"; page: CanonicalWikiPage }
  | { kind: "link_wiki_source"; pageId: string; sourceId: string }
  | { kind: "link_topic_wiki_page"; sourceId: string; topicId: string; pageId: string };

export type ProjectionPlan = {
  notebookId: string;
  scope: "notebook" | "source";
  sourceId?: string | undefined;
  operations: ProjectionOp[];
};
