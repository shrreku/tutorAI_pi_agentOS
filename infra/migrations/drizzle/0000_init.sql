CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"turn_id" text,
	"run_type" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"model_config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"budget_json" jsonb,
	"trace_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"artifact_type" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_node_refs_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_claim_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_chunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"source_version_id" text NOT NULL,
	"parent_chunk_id" text,
	"chunk_type" text NOT NULL,
	"text" text NOT NULL,
	"token_count" integer,
	"source_span_json" jsonb,
	"page_start" integer,
	"page_end" integer,
	"heading_path" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(1536),
	"fts_vector" text
);
--> statement-breakpoint
CREATE TABLE "claim_concept_links" (
	"claim_id" text NOT NULL,
	"concept_id" text NOT NULL,
	"role" text NOT NULL,
	"confidence" real
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_version_id" text NOT NULL,
	"claim_type" text NOT NULL,
	"claim_text" text NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"quality_score" real,
	"support_score" real,
	"confidence_components_json" jsonb,
	"source_span_json" jsonb,
	"source_chunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"canonical_name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"concept_type" text,
	"description" text,
	"confidence" real,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curricula" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"title" text NOT NULL,
	"curriculum_type" text NOT NULL,
	"scope_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"coverage_summary_json" jsonb,
	"confidence" real,
	"created_by_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"session_id" text,
	"run_id" text,
	"event_type" text NOT NULL,
	"sequence_no" integer NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_relations" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"source_node_type" text NOT NULL,
	"source_node_id" text NOT NULL,
	"target_node_type" text NOT NULL,
	"target_node_id" text NOT NULL,
	"relation_type" text NOT NULL,
	"confidence" real,
	"weight" real,
	"source_claim_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_chunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_state" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"user_id" text NOT NULL,
	"concept_id" text NOT NULL,
	"mastery_score" real DEFAULT 0 NOT NULL,
	"confidence" real,
	"last_practiced_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"misconception_json" jsonb,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "neo4j_projection_state" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"last_processed_event_id" text,
	"projection_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"lag_seconds" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notebooks" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"goal" text,
	"default_mode" text DEFAULT 'explore' NOT NULL,
	"settings_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"curriculum_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"prerequisite_concept_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_concept_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"success_criteria_json" jsonb,
	"source_refs_json" jsonb,
	"suggested_mode" text,
	"readiness_score" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"notebook_id" text NOT NULL,
	"session_id" text,
	"user_id" text NOT NULL,
	"question_id" text NOT NULL,
	"answer_json" jsonb NOT NULL,
	"is_correct" integer,
	"score" real,
	"concept_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"version" integer NOT NULL,
	"parser_name" text,
	"parser_version" text,
	"content_hash" text,
	"parse_confidence" real,
	"document_tree_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"title" text NOT NULL,
	"source_type" text NOT NULL,
	"original_object_key" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_objective_id" text,
	"upcoming_objective_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_objective_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"weak_concept_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active_session_id" text,
	"progress_summary_json" jsonb,
	"recommendation_reason_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"session_id" text NOT NULL,
	"turn_id" text,
	"tool_name" text NOT NULL,
	"side_effect_class" text NOT NULL,
	"input_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_json" jsonb,
	"status" text DEFAULT 'started' NOT NULL,
	"latency_ms" integer,
	"reducer_result_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"user_id" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"selected_node_refs_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"runtime_context_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tutor_turns" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"turn_index" integer NOT NULL,
	"user_message" text,
	"assistant_message" text,
	"selected_node_refs_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tool_summary_json" jsonb,
	"citation_refs_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"settings_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whiteboard_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"edge_type" text NOT NULL,
	"source_whiteboard_node_id" text NOT NULL,
	"target_whiteboard_node_id" text NOT NULL,
	"relation_id" text,
	"style_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whiteboard_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"node_type" text NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" text NOT NULL,
	"position_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"layout_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_page_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"block_key" text NOT NULL,
	"block_type" text NOT NULL,
	"owner_type" text NOT NULL,
	"content_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"markdown" text DEFAULT '' NOT NULL,
	"source_claim_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_chunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"notebook_id" text NOT NULL,
	"page_type" text NOT NULL,
	"page_key" text NOT NULL,
	"title" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"structured_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"markdown" text DEFAULT '' NOT NULL,
	"source_claim_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_chunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence_summary_json" jsonb,
	"quality_score" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_session_id_tutor_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."tutor_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_turn_id_tutor_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."tutor_turns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_source_version_id_source_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."source_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_parent_chunk_id_chunks_id_fk" FOREIGN KEY ("parent_chunk_id") REFERENCES "public"."chunks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_concept_links" ADD CONSTRAINT "claim_concept_links_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_concept_links" ADD CONSTRAINT "claim_concept_links_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_source_version_id_source_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."source_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_session_id_tutor_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."tutor_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_relations" ADD CONSTRAINT "graph_relations_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_state" ADD CONSTRAINT "learning_state_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_state" ADD CONSTRAINT "learning_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_state" ADD CONSTRAINT "learning_state_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neo4j_projection_state" ADD CONSTRAINT "neo4j_projection_state_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_versions" ADD CONSTRAINT "source_versions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_session_id_tutor_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."tutor_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_turn_id_tutor_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."tutor_turns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_sessions" ADD CONSTRAINT "tutor_sessions_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_sessions" ADD CONSTRAINT "tutor_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_turns" ADD CONSTRAINT "tutor_turns_session_id_tutor_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."tutor_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_edges" ADD CONSTRAINT "whiteboard_edges_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_edges" ADD CONSTRAINT "whiteboard_edges_source_whiteboard_node_id_whiteboard_nodes_id_fk" FOREIGN KEY ("source_whiteboard_node_id") REFERENCES "public"."whiteboard_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_edges" ADD CONSTRAINT "whiteboard_edges_target_whiteboard_node_id_whiteboard_nodes_id_fk" FOREIGN KEY ("target_whiteboard_node_id") REFERENCES "public"."whiteboard_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_edges" ADD CONSTRAINT "whiteboard_edges_relation_id_graph_relations_id_fk" FOREIGN KEY ("relation_id") REFERENCES "public"."graph_relations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_nodes" ADD CONSTRAINT "whiteboard_nodes_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_blocks" ADD CONSTRAINT "wiki_page_blocks_page_id_wiki_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_session_idx" ON "agent_runs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "artifacts_notebook_type_idx" ON "artifacts" USING btree ("notebook_id","artifact_type");--> statement-breakpoint
CREATE INDEX "chunks_source_version_idx" ON "chunks" USING btree ("source_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_concept_links_unique" ON "claim_concept_links" USING btree ("claim_id","concept_id","role");--> statement-breakpoint
CREATE INDEX "claims_notebook_status_idx" ON "claims" USING btree ("notebook_id","status");--> statement-breakpoint
CREATE INDEX "concepts_notebook_idx" ON "concepts" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "curricula_notebook_idx" ON "curricula" USING btree ("notebook_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_notebook_sequence_unique" ON "events" USING btree ("notebook_id","sequence_no");--> statement-breakpoint
CREATE INDEX "events_notebook_created_idx" ON "events" USING btree ("notebook_id","created_at");--> statement-breakpoint
CREATE INDEX "graph_relations_notebook_idx" ON "graph_relations" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "graph_relations_endpoints_idx" ON "graph_relations" USING btree ("source_node_type","source_node_id","target_node_type","target_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_state_notebook_user_concept_unique" ON "learning_state" USING btree ("notebook_id","user_id","concept_id");--> statement-breakpoint
CREATE UNIQUE INDEX "neo4j_projection_state_notebook_unique" ON "neo4j_projection_state" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "notebooks_owner_idx" ON "notebooks" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "objectives_notebook_idx" ON "objectives" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "objectives_curriculum_order_idx" ON "objectives" USING btree ("curriculum_id","order_index");--> statement-breakpoint
CREATE INDEX "quiz_attempts_notebook_idx" ON "quiz_attempts" USING btree ("notebook_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_versions_source_version_unique" ON "source_versions" USING btree ("source_id","version");--> statement-breakpoint
CREATE INDEX "sources_notebook_idx" ON "sources" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "sources_status_idx" ON "sources" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "study_plans_notebook_user_unique" ON "study_plans" USING btree ("notebook_id","user_id");--> statement-breakpoint
CREATE INDEX "tool_calls_run_idx" ON "tool_calls" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "tutor_sessions_notebook_idx" ON "tutor_sessions" USING btree ("notebook_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_turns_session_index_unique" ON "tutor_turns" USING btree ("session_id","turn_index");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "whiteboard_edges_notebook_idx" ON "whiteboard_edges" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "whiteboard_nodes_notebook_idx" ON "whiteboard_nodes" USING btree ("notebook_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_page_blocks_page_block_unique" ON "wiki_page_blocks" USING btree ("page_id","block_key");--> statement-breakpoint
CREATE INDEX "wiki_pages_notebook_type_key_idx" ON "wiki_pages" USING btree ("notebook_id","page_type","page_key");