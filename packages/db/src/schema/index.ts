import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    settingsJson: jsonb("settings_json").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const notebooks = pgTable(
  "notebooks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    goal: text("goal"),
    defaultMode: text("default_mode").notNull().default("explore"),
    settingsJson: jsonb("settings_json").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index("notebooks_owner_idx").on(t.ownerId)],
);

export const sources = pgTable(
  "sources",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sourceType: text("source_type").notNull(),
    originalObjectKey: text("original_object_key").notNull(),
    status: text("status").notNull().default("uploaded"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index("sources_notebook_idx").on(t.notebookId), index("sources_status_idx").on(t.status)],
);

export const sourceVersions = pgTable(
  "source_versions",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    parserName: text("parser_name"),
    parserVersion: text("parser_version"),
    contentHash: text("content_hash"),
    parseConfidence: real("parse_confidence"),
    documentTreeJson: jsonb("document_tree_json").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("source_versions_source_version_unique").on(t.sourceId, t.version)],
);

export const chunks = pgTable(
  "chunks",
  {
    id: text("id").primaryKey(),
    sourceVersionId: text("source_version_id")
      .notNull()
      .references(() => sourceVersions.id, { onDelete: "cascade" }),
    parentChunkId: text("parent_chunk_id").references((): AnyPgColumn => chunks.id),
    chunkType: text("chunk_type").notNull(),
    text: text("text").notNull(),
    tokenCount: integer("token_count"),
    sourceSpanJson: jsonb("source_span_json").$type<Record<string, unknown>>(),
    pageStart: integer("page_start"),
    pageEnd: integer("page_end"),
    headingPath: jsonb("heading_path").$type<string[]>().notNull().default([]),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    embedding: vector("embedding", { dimensions: 1536 }),
    ftsVector: text("fts_vector"),
  },
  (t) => [index("chunks_source_version_idx").on(t.sourceVersionId)],
);

export const concepts = pgTable(
  "concepts",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    canonicalName: text("canonical_name").notNull(),
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
    conceptType: text("concept_type"),
    description: text("description"),
    confidence: real("confidence"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index("concepts_notebook_idx").on(t.notebookId)],
);

export const studentProfiles = pgTable(
  "student_profiles",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalSummary: text("goal_summary"),
    backgroundSummary: text("background_summary"),
    pacePreference: text("pace_preference"),
    depthPreference: text("depth_preference"),
    examplePreferencesJson: jsonb("example_preferences_json").$type<Record<string, unknown>>().notNull().default({}),
    assessmentPreferenceJson: jsonb("assessment_preference_json").$type<Record<string, unknown>>().notNull().default({}),
    constraintsJson: jsonb("constraints_json").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("student_profiles_notebook_user_unique").on(t.notebookId, t.userId)],
);

export const curricula = pgTable(
  "curricula",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    curriculumType: text("curriculum_type").notNull(),
    scopeJson: jsonb("scope_json").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("draft"),
    activeModuleId: text("active_module_id"),
    sourceIds: jsonb("source_ids").$type<string[]>().notNull().default([]),
    coverageSummaryJson: jsonb("coverage_summary_json").$type<Record<string, unknown>>(),
    confidence: real("confidence"),
    createdByRunId: text("created_by_run_id"),
    ...timestamps,
  },
  (t) => [index("curricula_notebook_idx").on(t.notebookId)],
);

export const curriculumModules = pgTable(
  "curriculum_modules",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    curriculumId: text("curriculum_id")
      .notNull()
      .references(() => curricula.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary"),
    orderIndex: integer("order_index").notNull().default(0),
    status: text("status").notNull().default("draft"),
    sourceRefsJson: jsonb("source_refs_json").$type<unknown[]>().notNull().default([]),
    targetConceptIds: jsonb("target_concept_ids").$type<string[]>().notNull().default([]),
    prerequisiteModuleIds: jsonb("prerequisite_module_ids").$type<string[]>().notNull().default([]),
    estimatedSessionCount: integer("estimated_session_count").notNull().default(1),
    coverageRequirementsJson: jsonb("coverage_requirements_json").$type<Record<string, unknown>>().notNull().default({}),
    masteryGateJson: jsonb("mastery_gate_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("curriculum_modules_curriculum_order_idx").on(t.curriculumId, t.orderIndex)],
);

export const objectiveLists = pgTable(
  "objective_lists",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    curriculumId: text("curriculum_id")
      .notNull()
      .references(() => curricula.id, { onDelete: "cascade" }),
    moduleId: text("module_id")
      .notNull()
      .references(() => curriculumModules.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"),
    currentObjectiveId: text("current_objective_id"),
    objectiveIdsOrdered: jsonb("objective_ids_ordered").$type<string[]>().notNull().default([]),
    coverageSnapshotJson: jsonb("coverage_snapshot_json").$type<Record<string, unknown>>().notNull().default({}),
    createdByRunId: text("created_by_run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("objective_lists_module_idx").on(t.moduleId)],
);

export const sessionPlans = pgTable(
  "session_plans",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    curriculumId: text("curriculum_id")
      .notNull()
      .references(() => curricula.id, { onDelete: "cascade" }),
    moduleId: text("module_id")
      .notNull()
      .references(() => curriculumModules.id, { onDelete: "cascade" }),
    objectiveListId: text("objective_list_id")
      .notNull()
      .references(() => objectiveLists.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"),
    sessionGoal: text("session_goal"),
    plannedObjectiveIds: jsonb("planned_objective_ids").$type<string[]>().notNull().default([]),
    openerJson: jsonb("opener_json").$type<Record<string, unknown>>().notNull().default({}),
    diagnosticQuestionIds: jsonb("diagnostic_question_ids").$type<string[]>().notNull().default([]),
    teachingArcIds: jsonb("teaching_arc_ids").$type<string[]>().notNull().default([]),
    artifactRefsJson: jsonb("artifact_refs_json").$type<unknown[]>().notNull().default([]),
    exitCriteriaJson: jsonb("exit_criteria_json").$type<Record<string, unknown>>().notNull().default({}),
    recommendationReasonJson: jsonb("recommendation_reason_json").$type<Record<string, unknown>>().notNull().default({}),
    createdByRunId: text("created_by_run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("session_plans_notebook_idx").on(t.notebookId), index("session_plans_module_idx").on(t.moduleId)],
);

export const coverageItems = pgTable(
  "coverage_items",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    sourceId: text("source_id").references(() => sources.id, { onDelete: "cascade" }),
    sourceVersionId: text("source_version_id").references(() => sourceVersions.id, { onDelete: "cascade" }),
    itemFamily: text("item_family").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    conceptId: text("concept_id").references(() => concepts.id, { onDelete: "set null" }),
    claimId: text("claim_id").references(() => claims.id, { onDelete: "set null" }),
    sourceRefsJson: jsonb("source_refs_json").$type<unknown[]>().notNull().default([]),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("coverage_items_notebook_family_idx").on(t.notebookId, t.itemFamily)],
);

export const coverageRecords = pgTable(
  "coverage_records",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    coverageItemId: text("coverage_item_id")
      .notNull()
      .references(() => coverageItems.id, { onDelete: "cascade" }),
    curriculumId: text("curriculum_id").references(() => curricula.id, { onDelete: "cascade" }),
    moduleId: text("module_id").references(() => curriculumModules.id, { onDelete: "cascade" }),
    objectiveListId: text("objective_list_id").references(() => objectiveLists.id, { onDelete: "cascade" }),
    sessionPlanId: text("session_plan_id").references(() => sessionPlans.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("planned"),
    evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>().notNull().default({}),
    updatedByRunId: text("updated_by_run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("coverage_records_notebook_status_idx").on(t.notebookId, t.status)],
);

export const objectives = pgTable(
  "objectives",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    curriculumId: text("curriculum_id")
      .notNull()
      .references(() => curricula.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("not_started"),
    orderIndex: integer("order_index").notNull().default(0),
    prerequisiteConceptIds: jsonb("prerequisite_concept_ids").$type<string[]>().notNull().default([]),
    targetConceptIds: jsonb("target_concept_ids").$type<string[]>().notNull().default([]),
    successCriteriaJson: jsonb("success_criteria_json").$type<Record<string, unknown>>(),
    sourceRefsJson: jsonb("source_refs_json").$type<unknown[]>(),
    suggestedMode: text("suggested_mode"),
    readinessScore: real("readiness_score"),
    ...timestamps,
  },
  (t) => [
    index("objectives_notebook_idx").on(t.notebookId),
    index("objectives_curriculum_order_idx").on(t.curriculumId, t.orderIndex),
  ],
);

export const studyPlans = pgTable(
  "study_plans",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("active"),
    currentObjectiveId: text("current_objective_id"),
    upcomingObjectiveIds: jsonb("upcoming_objective_ids").$type<string[]>().notNull().default([]),
    completedObjectiveIds: jsonb("completed_objective_ids").$type<string[]>().notNull().default([]),
    weakConceptIds: jsonb("weak_concept_ids").$type<string[]>().notNull().default([]),
    activeSessionId: text("active_session_id"),
    progressSummaryJson: jsonb("progress_summary_json").$type<Record<string, unknown>>(),
    recommendationReasonJson: jsonb("recommendation_reason_json").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [uniqueIndex("study_plans_notebook_user_unique").on(t.notebookId, t.userId)],
);

export const claims = pgTable(
  "claims",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    sourceVersionId: text("source_version_id")
      .notNull()
      .references(() => sourceVersions.id, { onDelete: "cascade" }),
    claimType: text("claim_type").notNull(),
    claimText: text("claim_text").notNull(),
    status: text("status").notNull().default("candidate"),
    confidence: real("confidence").notNull().default(0),
    qualityScore: real("quality_score"),
    supportScore: real("support_score"),
    confidenceComponentsJson: jsonb("confidence_components_json").$type<Record<string, unknown>>(),
    sourceSpanJson: jsonb("source_span_json").$type<Record<string, unknown>>(),
    sourceChunkIds: jsonb("source_chunk_ids").$type<string[]>().notNull().default([]),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    supersededByClaimId: text("superseded_by_claim_id").references((): AnyPgColumn => claims.id, {
      onDelete: "set null",
    }),
    reinforcementCount: integer("reinforcement_count").notNull().default(0),
    retrievalWeight: real("retrieval_weight").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("claims_notebook_status_idx").on(t.notebookId, t.status),
    index("claims_notebook_superseded_idx").on(t.notebookId, t.supersededByClaimId),
  ],
);

export const claimConceptLinks = pgTable(
  "claim_concept_links",
  {
    claimId: text("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    conceptId: text("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    confidence: real("confidence"),
  },
  (t) => [uniqueIndex("claim_concept_links_unique").on(t.claimId, t.conceptId, t.role)],
);

export const graphRelations = pgTable(
  "graph_relations",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    sourceNodeType: text("source_node_type").notNull(),
    sourceNodeId: text("source_node_id").notNull(),
    targetNodeType: text("target_node_type").notNull(),
    targetNodeId: text("target_node_id").notNull(),
    relationType: text("relation_type").notNull(),
    confidence: real("confidence"),
    weight: real("weight"),
    sourceClaimIds: jsonb("source_claim_ids").$type<string[]>().notNull().default([]),
    sourceChunkIds: jsonb("source_chunk_ids").$type<string[]>().notNull().default([]),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("graph_relations_notebook_idx").on(t.notebookId),
    index("graph_relations_endpoints_idx").on(t.sourceNodeType, t.sourceNodeId, t.targetNodeType, t.targetNodeId),
  ],
);

export const wikiPages = pgTable(
  "wiki_pages",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    pageType: text("page_type").notNull(),
    pageKey: text("page_key").notNull(),
    title: text("title").notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"),
    structuredJson: jsonb("structured_json").$type<Record<string, unknown>>().notNull().default({}),
    markdown: text("markdown").notNull().default(""),
    sourceClaimIds: jsonb("source_claim_ids").$type<string[]>().notNull().default([]),
    sourceChunkIds: jsonb("source_chunk_ids").$type<string[]>().notNull().default([]),
    confidenceSummaryJson: jsonb("confidence_summary_json").$type<Record<string, unknown>>(),
    qualityScore: real("quality_score"),
    ...timestamps,
  },
  (t) => [index("wiki_pages_notebook_type_key_idx").on(t.notebookId, t.pageType, t.pageKey)],
);

export const wikiPageBlocks = pgTable(
  "wiki_page_blocks",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id")
      .notNull()
      .references(() => wikiPages.id, { onDelete: "cascade" }),
    blockKey: text("block_key").notNull(),
    blockType: text("block_type").notNull(),
    ownerType: text("owner_type").notNull(),
    contentJson: jsonb("content_json").$type<Record<string, unknown>>().notNull().default({}),
    markdown: text("markdown").notNull().default(""),
    sourceClaimIds: jsonb("source_claim_ids").$type<string[]>().notNull().default([]),
    sourceChunkIds: jsonb("source_chunk_ids").$type<string[]>().notNull().default([]),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("active"),
  },
  (t) => [uniqueIndex("wiki_page_blocks_page_block_unique").on(t.pageId, t.blockKey)],
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    artifactType: text("artifact_type").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull().default({}),
    sourceNodeRefsJson: jsonb("source_node_refs_json").$type<unknown[]>().notNull().default([]),
    sourceClaimIds: jsonb("source_claim_ids").$type<string[]>().notNull().default([]),
    sourceChunkIds: jsonb("source_chunk_ids").$type<string[]>().notNull().default([]),
    createdByRunId: text("created_by_run_id"),
    ...timestamps,
  },
  (t) => [index("artifacts_notebook_type_idx").on(t.notebookId, t.artifactType)],
);

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: text("id").primaryKey(),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    sessionId: text("session_id"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    answerJson: jsonb("answer_json").$type<Record<string, unknown>>().notNull(),
    isCorrect: integer("is_correct"),
    score: real("score"),
    conceptIds: jsonb("concept_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("quiz_attempts_notebook_idx").on(t.notebookId)],
);

export const learningState = pgTable(
  "learning_state",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conceptId: text("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    masteryScore: real("mastery_score").notNull().default(0),
    confidence: real("confidence"),
    lastPracticedAt: timestamp("last_practiced_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    misconceptionJson: jsonb("misconception_json").$type<Record<string, unknown>>(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [uniqueIndex("learning_state_notebook_user_concept_unique").on(t.notebookId, t.userId, t.conceptId)],
);

export const tutorSessions = pgTable(
  "tutor_sessions",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    status: text("status").notNull().default("active"),
    selectedNodeRefsJson: jsonb("selected_node_refs_json").$type<unknown[]>().notNull().default([]),
    runtimeContextJson: jsonb("runtime_context_json").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("tutor_sessions_notebook_idx").on(t.notebookId)],
);

export const tutorTurns = pgTable(
  "tutor_turns",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => tutorSessions.id, { onDelete: "cascade" }),
    turnIndex: integer("turn_index").notNull(),
    userMessage: text("user_message"),
    assistantMessage: text("assistant_message"),
    selectedNodeRefsJson: jsonb("selected_node_refs_json").$type<unknown[]>().notNull().default([]),
    toolSummaryJson: jsonb("tool_summary_json").$type<Record<string, unknown>>(),
    citationRefsJson: jsonb("citation_refs_json").$type<unknown[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tutor_turns_session_index_unique").on(t.sessionId, t.turnIndex)],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => tutorSessions.id, { onDelete: "cascade" }),
    turnId: text("turn_id").references(() => tutorTurns.id, { onDelete: "set null" }),
    runType: text("run_type").notNull(),
    status: text("status").notNull().default("running"),
    modelConfigJson: jsonb("model_config_json").$type<Record<string, unknown>>().notNull().default({}),
    budgetJson: jsonb("budget_json").$type<Record<string, unknown>>(),
    traceId: text("trace_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("agent_runs_session_idx").on(t.sessionId)],
);

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => tutorSessions.id, { onDelete: "cascade" }),
    turnId: text("turn_id").references(() => tutorTurns.id, { onDelete: "set null" }),
    toolName: text("tool_name").notNull(),
    sideEffectClass: text("side_effect_class").notNull(),
    inputJson: jsonb("input_json").$type<Record<string, unknown>>().notNull().default({}),
    outputJson: jsonb("output_json").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("started"),
    latencyMs: integer("latency_ms"),
    reducerResultJson: jsonb("reducer_result_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tool_calls_run_idx").on(t.runId)],
);

export const masteryEvidence = pgTable(
  "mastery_evidence",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => tutorSessions.id, { onDelete: "set null" }),
    turnId: text("turn_id").references(() => tutorTurns.id, { onDelete: "set null" }),
    runId: text("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    evidenceJson: jsonb("evidence_json").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mastery_evidence_notebook_created_idx").on(t.notebookId, t.createdAt),
    index("mastery_evidence_session_idx").on(t.sessionId, t.createdAt),
  ],
);

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => tutorSessions.id, { onDelete: "set null" }),
    runId: text("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    sequenceNo: integer("sequence_no").notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("events_notebook_sequence_unique").on(t.notebookId, t.sequenceNo),
    index("events_notebook_created_idx").on(t.notebookId, t.createdAt),
  ],
);

export const syntheticLearnerEvalRuns = pgTable(
  "synthetic_learner_eval_runs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    fixtureManifestId: text("fixture_manifest_id").notNull(),
    fixtureVersion: text("fixture_version").notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    scenarioRunCount: integer("scenario_run_count").notNull().default(0),
    failedScenarioCount: integer("failed_scenario_count").notNull().default(0),
    personaCoverageJson: jsonb("persona_coverage_json").$type<string[]>().notNull().default([]),
    scenarioCoverageJson: jsonb("scenario_coverage_json").$type<string[]>().notNull().default([]),
    notebookRefsJson: jsonb("notebook_refs_json").$type<Array<{ refType: string; refId: string }>>().notNull().default([]),
    runJson: jsonb("run_json").$type<Record<string, unknown>>().notNull(),
    ...timestamps,
  },
  (t) => [
    index("synthetic_learner_eval_runs_owner_idx").on(t.ownerId, t.startedAt),
    index("synthetic_learner_eval_runs_notebook_idx").on(t.notebookId),
  ],
);

export const whiteboardNodes = pgTable(
  "whiteboard_nodes",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    nodeType: text("node_type").notNull(),
    refType: text("ref_type").notNull(),
    refId: text("ref_id").notNull(),
    positionJson: jsonb("position_json").$type<Record<string, unknown>>().notNull().default({}),
    layoutJson: jsonb("layout_json").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("whiteboard_nodes_notebook_idx").on(t.notebookId)],
);

export const whiteboardEdges = pgTable(
  "whiteboard_edges",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    edgeType: text("edge_type").notNull(),
    sourceWhiteboardNodeId: text("source_whiteboard_node_id")
      .notNull()
      .references(() => whiteboardNodes.id, { onDelete: "cascade" }),
    targetWhiteboardNodeId: text("target_whiteboard_node_id")
      .notNull()
      .references(() => whiteboardNodes.id, { onDelete: "cascade" }),
    relationId: text("relation_id").references(() => graphRelations.id, { onDelete: "set null" }),
    styleJson: jsonb("style_json").$type<Record<string, unknown>>().notNull().default({}),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("whiteboard_edges_notebook_idx").on(t.notebookId)],
);

export const neo4jProjectionState = pgTable(
  "neo4j_projection_state",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    lastProcessedEventId: text("last_processed_event_id"),
    projectionVersion: integer("projection_version").notNull().default(1),
    status: text("status").notNull().default("idle"),
    lagSeconds: integer("lag_seconds"),
    lastProjectedAt: timestamp("last_projected_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    canonicalUpdatedAt: timestamp("canonical_updated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("neo4j_projection_state_notebook_unique").on(t.notebookId)],
);

export const neo4jSourceProjectionState = pgTable(
  "neo4j_source_projection_state",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("idle"),
    lagSeconds: integer("lag_seconds"),
    lastProjectedAt: timestamp("last_projected_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    canonicalUpdatedAt: timestamp("canonical_updated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("neo4j_source_projection_state_notebook_source_unique").on(t.notebookId, t.sourceId),
    index("neo4j_source_projection_state_notebook_idx").on(t.notebookId),
  ],
);
