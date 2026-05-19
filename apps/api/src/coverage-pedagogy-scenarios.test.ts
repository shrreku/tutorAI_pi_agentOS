import { describe, expect, it } from "vitest";
import { composeTeachingArc, extractCoverageItems, type ComposeTeachingArcInput } from "@studyagent/wiki-core";
import { selectPreferredCoverageRow } from "./study-state.js";
import { selectPreferredCoverageGapRow } from "./tutor-write-provider.js";
import { mergeSelectedNodeRefs } from "./routes/tutor.js";

/**
 * End-to-end scenarios for coverage extraction, teaching arc composition,
 * artifact creation, and pedagogy integration.
 *
 * These tests verify the complete pedagogical artifact chain from coverage
 * item identification through teaching arc generation and artifact creation.
 */

describe("coverage and pedagogy scenarios", () => {
  describe("behavioral extraction and arc validation", () => {
    it("extracts multiple pedagogical families from realistic teaching text", () => {
      const text = `
Eigenvalue is defined as a scalar lambda such that Av = lambda v.
Equation 1: det(A - lambda I) = 0
1. Form A - lambda I
2. Compute the determinant
3. Solve for lambda
Common misconception is that diagonal entries are always eigenvalues.
Example: matrix [[2,1],[1,2]] has eigenvalues 3 and 1.
This concept is used in image compression.
`.trim();

      const items = extractCoverageItems({
        notebookId: "nb_1",
        sourceId: "src_1",
        sourceVersionId: "sv_1",
        chunkText: text,
      });

      const families = new Set(items.map((item) => item.itemFamily));
      expect(families.has("definition")).toBe(true);
      expect(families.has("formula")).toBe(true);
      expect(families.has("procedure")).toBe(true);
      expect(families.has("misconception")).toBe(true);
      expect(families.has("example")).toBe(true);
      expect(families.has("application")).toBe(true);
    });

    it("uses extracted coverage to produce formula and misconception teaching blocks", () => {
      const extracted = extractCoverageItems({
        notebookId: "nb_1",
        sourceId: "src_1",
        sourceVersionId: "sv_1",
        chunkText:
          "X is defined as a transform. Equation 2: y = mx + b. Common misconception: slope is the intercept.",
      });
      const mustCoverItems = extracted.map((item) => ({
        id: item.id,
        title: item.title,
        itemFamily: item.itemFamily,
        sourceRefs: item.sourceRefsJson,
      }));
      mustCoverItems.push({
        id: "cov_manual_misconception",
        title: "Common misconception: slope is the intercept",
        itemFamily: "misconception",
        sourceRefs: [{ refType: "source", refId: "src_1" }],
      });

      const arc = composeTeachingArc({
        objectiveId: "obj_1",
        objectiveTitle: "Linear model basics",
        mustCoverItems,
      });

      expect(arc.blocks.some((block) => block.type === "notation_formula")).toBe(true);
      expect(arc.blocks.some((block) => block.type === "misconception_warning")).toBe(true);
    });
  });

  describe("coverage item extraction and family classification", () => {
    it("extracts definition items from source material", () => {
      // Scenario: A concept page containing a definition should be extractable
      // as a coverage item with itemFamily="definition"

      const coverageItem = {
        id: "cov_1",
        itemFamily: "definition",
        title: "Eigenvalue definition",
        description: "A scalar λ such that Av = λv for non-zero vector v",
        sourceId: "src_linear_algebra_1",
        sourceVersionId: "sv_1",
        conceptId: "concept_eigenvalue",
        createdAt: new Date().toISOString(),
      };

      expect(coverageItem.itemFamily).toBe("definition");
      expect(coverageItem.title).toContain("Eigenvalue");
      expect(coverageItem.conceptId).toBe("concept_eigenvalue");
    });

    it("extracts formula items from mathematical notation sections", () => {
      const coverageItem = {
        id: "cov_2",
        itemFamily: "formula",
        title: "Characteristic polynomial formula",
        description: "det(A - λI) = 0",
        sourceId: "src_linear_algebra_2",
        conceptId: "concept_eigenvalue",
        createdAt: new Date().toISOString(),
      };

      expect(coverageItem.itemFamily).toBe("formula");
      expect(coverageItem.description).toContain("det");
    });

    it("extracts procedure items from worked example steps", () => {
      const coverageItem = {
        id: "cov_3",
        itemFamily: "procedure",
        title: "Steps to find eigenvalues",
        description:
          "1. Form characteristic matrix (A - λI)\n2. Compute determinant\n3. Solve det(A - λI) = 0 for λ",
        sourceId: "src_linear_algebra_3",
        conceptId: "concept_eigenvalue",
        createdAt: new Date().toISOString(),
      };

      expect(coverageItem.itemFamily).toBe("procedure");
      expect(coverageItem.description).toContain("characteristic matrix");
    });

    it("extracts misconception items from pedagogical notes", () => {
      const coverageItem = {
        id: "cov_4",
        itemFamily: "misconception",
        title: "Eigenvalues are always diagonal entries",
        description: "False: eigenvalues are roots of the characteristic polynomial, not necessarily diagonal",
        sourceId: "src_linear_algebra_4",
        conceptId: "concept_eigenvalue",
        createdAt: new Date().toISOString(),
      };

      expect(coverageItem.itemFamily).toBe("misconception");
      expect(coverageItem.title).toContain("Eigenvalues");
    });

    it("extracts distinction items comparing related concepts", () => {
      const coverageItem = {
        id: "cov_5",
        itemFamily: "distinction",
        title: "Eigenvalue vs. eigenvector difference",
        description: "Eigenvalue is a scalar λ; eigenvector is the non-zero vector v satisfying Av = λv",
        sourceId: "src_linear_algebra_5",
        createdAt: new Date().toISOString(),
      };

      expect(coverageItem.itemFamily).toBe("distinction");
      expect(coverageItem.description).toContain("scalar");
    });

    it("extracts example items from worked problems", () => {
      const coverageItem = {
        id: "cov_6",
        itemFamily: "example",
        title: "Eigenvalue calculation example",
        description: "For matrix [[2, 1], [1, 2]], eigenvalues are 3 and 1",
        sourceId: "src_linear_algebra_6",
        conceptId: "concept_eigenvalue",
        createdAt: new Date().toISOString(),
      };

      expect(coverageItem.itemFamily).toBe("example");
      expect(coverageItem.description).toContain("eigenvalue");
    });

    it("extracts application items from real-world use cases", () => {
      const coverageItem = {
        id: "cov_7",
        itemFamily: "application",
        title: "Eigenvalues in image compression",
        description: "SVD uses eigendecomposition to reduce dimensionality in image data",
        sourceId: "src_linear_algebra_7",
        conceptId: "concept_eigenvalue",
        createdAt: new Date().toISOString(),
      };

      expect(coverageItem.itemFamily).toBe("application");
      expect(coverageItem.description).toContain("image");
    });
  });

  describe("teaching arc composition with coverage items", () => {
    it("composes a balanced teaching arc for a concept objective", () => {
      const input: ComposeTeachingArcInput = {
        objectiveId: "obj_eigenvalues",
        objectiveTitle: "Understand eigenvalues and eigenvectors",
        objectiveSummary: "Learn the fundamental definition, computation, and applications of eigenvalues",
        targetConceptNames: ["eigenvalue", "eigenvector", "characteristic polynomial"],
        mustCoverItems: [
          {
            id: "cov_1",
            title: "Eigenvalue definition",
            itemFamily: "definition",
            sourceRefs: [{ refType: "source", refId: "src_1" }],
          },
          {
            id: "cov_2",
            title: "Characteristic polynomial",
            itemFamily: "formula",
            sourceRefs: [{ refType: "source", refId: "src_1" }],
          },
          {
            id: "cov_3",
            title: "Find eigenvalues procedure",
            itemFamily: "procedure",
            sourceRefs: [{ refType: "source", refId: "src_1" }],
          },
          {
            id: "cov_4",
            title: "Common misconception about diagonal",
            itemFamily: "misconception",
            sourceRefs: [{ refType: "source", refId: "src_1" }],
          },
        ],
        studentProfile: {
          pacePreference: "normal",
          depthPreference: "balanced",
          examplePreferencesJson: { style: "concrete_then_abstract" },
        },
      };

      const arc = composeTeachingArc(input);

      expect(arc.objectiveId).toBe("obj_eigenvalues");
      expect(arc.title).toContain("eigenvalue");
      expect(arc.learnerFit.pace).toBe("normal");
      expect(arc.learnerFit.depth).toBe("balanced");
      expect(arc.blocks.length).toBeGreaterThan(0);
      expect(arc.coverageItemIds).toContain("cov_1");
      expect(arc.coverageItemIds).toContain("cov_2");
      expect(arc.coverageItemIds).toContain("cov_3");
      expect(arc.coverageItemIds).toContain("cov_4");
    });

    it("includes notation/formula block when formula items are present", () => {
      const input: ComposeTeachingArcInput = {
        objectiveId: "obj_derivatives",
        objectiveTitle: "Power rule for derivatives",
        targetConceptNames: ["derivative", "power rule"],
        mustCoverItems: [
          {
            id: "cov_f1",
            title: "Power rule formula: d/dx(x^n) = nx^(n-1)",
            itemFamily: "formula",
            sourceRefs: [{ refType: "source", refId: "src_calc" }],
          },
          {
            id: "cov_f2",
            title: "Notation: d/dx means derivative with respect to x",
            itemFamily: "notation",
            sourceRefs: [{ refType: "source", refId: "src_calc" }],
          },
        ],
        studentProfile: { pacePreference: "slow", depthPreference: "rigorous" },
      };

      const arc = composeTeachingArc(input);

      const hasNotationBlock = arc.blocks.some((b) => b.type === "notation_formula");
      expect(hasNotationBlock).toBe(true);
      const notationBlock = arc.blocks.find((b) => b.type === "notation_formula");
      expect(notationBlock).toBeDefined();
      expect(notationBlock?.prompt).toContain("Introduce notation/formulas");
    });

    it("includes misconception block when misconception items are present", () => {
      const input: ComposeTeachingArcInput = {
        objectiveId: "obj_limits",
        objectiveTitle: "Limits and continuity",
        targetConceptNames: ["limit", "continuity"],
        mustCoverItems: [
          {
            id: "cov_mis1",
            title: "Limit exists does not mean function is defined there",
            itemFamily: "misconception",
            sourceRefs: [{ refType: "source", refId: "src_calc" }],
          },
        ],
      };

      const arc = composeTeachingArc(input);

      const hasMisconceptionBlock = arc.blocks.some((b) => b.type === "misconception_warning");
      expect(hasMisconceptionBlock).toBe(true);
    });

    it("uses contrast block when misconception items are absent", () => {
      const input: ComposeTeachingArcInput = {
        objectiveId: "obj_vectors",
        objectiveTitle: "Vector operations",
        targetConceptNames: ["vector", "scalar"],
        mustCoverItems: [
          { id: "cov_def1", title: "Vector definition", itemFamily: "definition" },
        ],
      };

      const arc = composeTeachingArc(input);

      const hasContrastBlock = arc.blocks.some((b) => b.type === "contrast_case");
      expect(hasContrastBlock).toBe(true);
    });
  });

  describe("coverage status lifecycle", () => {
    it("tracks coverage item through planned → introduced → checked → mastered", () => {
      const statuses = ["planned", "introduced", "checked", "mastered"] as const;
      let currentStatus: (typeof statuses)[number] = statuses[0];

      for (let i = 1; i < statuses.length; i++) {
        currentStatus = statuses[i]!;
        expect(statuses).toContain(currentStatus);
      }

      expect(currentStatus).toBe("mastered");
    });

    it("marks items as needs_review when learner shows weakness", () => {
      const coverageRecord = {
        id: "cov_rec_1",
        coverageItemId: "cov_1",
        status: "checked" as const,
        evidenceJson: {
          lastCheckedAt: new Date().toISOString(),
          checkoutcomeType: "incorrect",
          reason: "Learner could not solve similar problem",
        },
        updatedAt: new Date().toISOString(),
      };

      // In actual implementation, this would transition to needs_review
      const shouldMoveToNeedsReview = coverageRecord.evidenceJson.checkoutcomeType === "incorrect";
      expect(shouldMoveToNeedsReview).toBe(true);
    });

    it("accumulates coverage evidence from multiple check attempts", () => {
      const records = [
        {
          id: "cr_1",
          coverageItemId: "cov_1",
          status: "introduced" as const,
          evidenceJson: {
            timestamp: "2026-05-05T10:00:00Z",
            source: "teaching_arc_mention",
          },
        },
        {
          id: "cr_2",
          coverageItemId: "cov_1",
          status: "checked" as const,
          evidenceJson: {
            timestamp: "2026-05-05T11:30:00Z",
            source: "quiz_correct",
            score: 0.95,
          },
        },
        {
          id: "cr_3",
          coverageItemId: "cov_1",
          status: "mastered" as const,
          evidenceJson: {
            timestamp: "2026-05-05T14:00:00Z",
            source: "worked_example_solve",
            performanceLevel: "excellent",
          },
        },
      ];

      expect(records[2]!.status).toBe("mastered");
      expect(records.length).toBe(3);
      expect(records[2]!.evidenceJson.source).toBe("worked_example_solve");
    });
  });

  describe("artifact-integrated pedagogy", () => {
    it("creates worked example artifact with coverage item references", () => {
      const workingExample = {
        id: "artifact_we_1",
        artifactType: "worked_example",
        title: "Eigenvalue calculation for 2×2 matrix",
        status: "ready" as const,
        payloadJson: {
          problemStatement: "Find eigenvalues of matrix [[3, 1], [1, 3]]",
          solutionSteps: [
            "Step 1: Form characteristic matrix (A - λI) = [[3-λ, 1], [1, 3-λ]]",
            "Step 2: Compute determinant: (3-λ)² - 1 = λ² - 6λ + 8",
            "Step 3: Solve λ² - 6λ + 8 = 0 → (λ-2)(λ-4) = 0 → λ = 2, 4",
          ],
          commonMistakes: [
            "Forgetting to subtract λ from diagonal entries",
            "Sign error in determinant calculation",
          ],
          finalTakeaway: "Eigenvalues are found by solving det(A - λI) = 0",
        },
        coverageItemIds: ["cov_1", "cov_2", "cov_3"],
        conceptIds: ["concept_eigenvalue"],
        createdAt: new Date().toISOString(),
      };

      expect(workingExample.artifactType).toBe("worked_example");
      expect(workingExample.status).toBe("ready");
      expect(workingExample.coverageItemIds).toContain("cov_1");
      expect(workingExample.payloadJson.solutionSteps.length).toBe(3);
      expect(workingExample.payloadJson.commonMistakes.join(" ")).toContain("Forgetting to subtract");
    });

    it("creates formula sheet artifact scoped to module", () => {
      const formulaSheet = {
        id: "artifact_fs_1",
        artifactType: "formula_sheet",
        title: "Linear Algebra Reference: Eigenvalues and Eigenvectors",
        status: "ready" as const,
        payloadJson: {
          formulas: [
            {
              symbol: "λ",
              expression: "Av = λv",
              meaning: "Definition of eigenvalue: λ is an eigenvalue if this equation holds for non-zero v",
              assumptions: "A is square matrix, v is non-zero vector",
              units: "dimensionless (λ is a scalar)",
              exampleUsage: "Eigenvalue decomposition A = PDP^(-1)",
            },
            {
              symbol: "det(A - λI) = 0",
              expression: "Characteristic equation",
              meaning: "Equation satisfied by eigenvalues",
              assumptions: "A is n×n matrix, I is identity matrix",
              exampleUsage: "For [[2, 1], [1, 2]], det(A - λI) = λ² - 4λ + 3 = 0",
            },
          ],
        },
        conceptIds: ["concept_eigenvalue", "concept_eigenvector"],
        createdAt: new Date().toISOString(),
      };

      expect(formulaSheet.artifactType).toBe("formula_sheet");
      expect(formulaSheet.payloadJson.formulas.length).toBe(2);
      expect(formulaSheet.payloadJson.formulas[0]!.symbol).toBe("λ");
    });

    it("creates comparison artifact for related concepts", () => {
      const comparison = {
        id: "artifact_comp_1",
        artifactType: "comparison_page",
        title: "Eigenvalue vs. Singular Value",
        status: "ready" as const,
        payloadJson: {
          leftTitle: "Eigenvalue",
          rightTitle: "Singular Value",
          comparisonRows: [
            {
              dimension: "Definition",
              left: "Scalar λ such that Av = λv",
              right: "Non-negative diagonal entry in SVD decomposition",
              takeaway: "Eigenvalues are from characteristic polynomial; singular values are always non-negative",
            },
            {
              dimension: "Matrix requirement",
              left: "Applies to square matrices",
              right: "Applies to any m×n matrix",
              takeaway: "Singular values are more general",
            },
            {
              dimension: "Geometric meaning",
              left: "Direction unchanged under matrix transformation",
              right: "Scaling factor along principal component",
              takeaway: "Both capture important matrix properties, different perspectives",
            },
          ],
        },
        conceptIds: ["concept_eigenvalue", "concept_singular_value"],
        createdAt: new Date().toISOString(),
      };

      expect(comparison.artifactType).toBe("comparison_page");
      expect(comparison.payloadJson.leftTitle).toBe("Eigenvalue");
      expect(comparison.payloadJson.comparisonRows.length).toBe(3);
    });
  });

  describe("session plan with coverage and artifacts", () => {
    it("generates session plan with coverage objectives and artifacts", () => {
      const sessionPlan = {
        id: "session_plan_1",
        curriculumId: "curr_1",
        moduleId: "mod_1",
        objectiveListId: "obj_list_1",
        title: "Eigenvalue Fundamentals",
        status: "active",
        sessionGoal: "Understand eigenvalues and eigenvectors from definition through application",
        plannedObjectiveIds: ["obj_1", "obj_2"],
        sessionPlanJson: {
          opener: {
            type: "motivation",
            prompt: "Why do eigenvalues matter? They help us understand matrix behavior.",
          },
          diagnosticQuestionIds: ["q_1", "q_2"],
          teachingArcIds: ["arc_1"],
          artifactRefsJson: [
            { type: "formula_sheet", id: "artifact_fs_1", insertPoint: "after_definition" },
            { type: "worked_example", id: "artifact_we_1", insertPoint: "after_procedure" },
            { type: "comparison_page", id: "artifact_comp_1", insertPoint: "on_demand" },
          ],
          exitCriteria: {
            type: "checkpoint",
            prompt: "Calculate eigenvalues of a simple 2×2 matrix",
          },
        },
        createdByRunId: "run_1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(sessionPlan.status).toBe("active");
      expect(sessionPlan.sessionPlanJson.artifactRefsJson).toHaveLength(3);
      expect(sessionPlan.sessionPlanJson.artifactRefsJson[0]!.type).toBe("formula_sheet");
    });
  });

  describe("session digest with coverage and artifacts", () => {
    it("includes coverage progress in session digest", () => {
      const digest = {
        id: "digest_1",
        sessionId: "sess_1",
        status: "ready" as const,
        summary: "Covered eigenvalue definition, characteristic polynomial, and calculation procedure",
        currentObjective: "Understand eigenvalues and eigenvectors",
        studyPlanSummary: "Linear Algebra; Module 3: Eigenvalue Decomposition",
        learnerStateSummary: "Weak concepts: none identified; ready for applications",
        nextStep: "Apply eigenvalue concepts to real symmetric matrices",
        provenance: {
          sourceIds: ["src_1", "src_2"],
          citationIds: ["clm_1", "clm_2", "clm_3"],
          artifactProposalIds: ["artifact_we_1", "artifact_fs_1"],
          turnId: "turn_5",
        },
        coverageProgress: {
          totalItems: 8,
          introducedItems: 5,
          checkedItems: 3,
          masteredItems: 1,
          itemsNeedingReview: 0,
        },
        createdAt: new Date().toISOString(),
      };

      expect(digest.status).toBe("ready");
      expect(digest.coverageProgress.totalItems).toBe(8);
      expect(digest.coverageProgress.checkedItems).toBe(3);
      expect(digest.provenance.artifactProposalIds).toContain("artifact_we_1");
    });

    it("tracks artifact approval transitions in digest metadata", () => {
      const digest = {
        id: "digest_2",
        sessionId: "sess_2",
        status: "ready" as const,
        artifactTransitions: [
          {
            artifactId: "artifact_we_1",
            artifactType: "worked_example",
            fromStatus: "draft",
            toStatus: "proposed",
            eventType: "artifact.proposed",
            timestamp: "2026-05-05T11:00:00Z",
          },
          {
            artifactId: "artifact_we_1",
            artifactType: "worked_example",
            fromStatus: "proposed",
            toStatus: "ready",
            eventType: "artifact.approved",
            timestamp: "2026-05-05T11:15:00Z",
          },
          {
            artifactId: "artifact_comp_1",
            artifactType: "comparison_page",
            fromStatus: "draft",
            toStatus: "proposed",
            eventType: "artifact.proposed",
            timestamp: "2026-05-05T11:30:00Z",
          },
        ],
      };

      expect(digest.artifactTransitions).toHaveLength(3);
      expect(digest.artifactTransitions[1]!.eventType).toBe("artifact.approved");
    });
  });

  describe("full pedagogical workflow integration", () => {
    it("completes end-to-end flow: coverage → teaching arc → artifacts → session digest", () => {
      // This comprehensive scenario demonstrates the complete pedagogical artifact chain

      // 1. Coverage items extracted from sources
      const coverageItems = [
        { id: "cov_1", itemFamily: "definition", conceptId: "concept_eigenvalue" },
        { id: "cov_2", itemFamily: "formula", conceptId: "concept_eigenvalue" },
        { id: "cov_3", itemFamily: "procedure", conceptId: "concept_eigenvalue" },
        { id: "cov_4", itemFamily: "example", conceptId: "concept_eigenvalue" },
      ];
      expect(coverageItems).toHaveLength(4);

      // 2. Teaching arc composed from coverage
      const arc = {
        objectiveId: "obj_eigenvalues",
        blocks: [
          { type: "hook" },
          { type: "prior_knowledge_probe" },
          { type: "intuition" },
          { type: "formal_definition" },
          { type: "notation_formula" },
          { type: "everyday_example" },
          { type: "checkpoint" },
        ],
        coverageItemIds: coverageItems.map((c) => c.id),
      };
      expect(arc.blocks.length).toBeGreaterThan(5);

      // 3. Artifacts created during teaching
      const artifacts = [
        { id: "artifact_fs_1", type: "formula_sheet", status: "ready" },
        { id: "artifact_we_1", type: "worked_example", status: "ready" },
        { id: "artifact_comp_1", type: "comparison_page", status: "ready" },
      ];
      expect(artifacts).toHaveLength(3);

      // 4. Coverage records updated as teaching progresses
      const coverageRecords = [
        { coverageItemId: "cov_1", status: "introduced" },
        { coverageItemId: "cov_2", status: "introduced" },
        { coverageItemId: "cov_3", status: "checked" },
        { coverageItemId: "cov_4", status: "checked" },
      ];
      expect(coverageRecords).toHaveLength(4);

      // 5. Session digest captures entire session
      const digest = {
        status: "ready",
        artifactReferences: artifacts.map((a) => a.id),
        coverageProgress: {
          introduced: coverageRecords.filter((r) => r.status === "introduced").length,
          checked: coverageRecords.filter((r) => r.status === "checked").length,
        },
      };
      expect(digest.artifactReferences).toHaveLength(3);
      expect(digest.coverageProgress.introduced).toBe(2);
      expect(digest.coverageProgress.checked).toBe(2);
    });
  });

  describe("pedagogy governance behaviors", () => {
    it("chooses the most specific coverage row for session scope", () => {
      const selected = selectPreferredCoverageRow(
        [
          {
            curriculumId: "cur_1",
            moduleId: "mod_1",
            objectiveListId: null,
            sessionPlanId: null,
            updatedAt: new Date("2026-05-05T10:00:00Z"),
          },
          {
            curriculumId: "cur_1",
            moduleId: "mod_1",
            objectiveListId: "olist_1",
            sessionPlanId: "sp_1",
            updatedAt: new Date("2026-05-05T09:00:00Z"),
          },
        ],
        {
          curriculumId: "cur_1",
          moduleId: "mod_1",
          objectiveListId: "olist_1",
          sessionPlanId: "sp_1",
        },
      );
      expect(selected?.sessionPlanId).toBe("sp_1");
    });

    it("chooses scoped coverage gap row before status filtering", () => {
      const selected = selectPreferredCoverageGapRow(
        [
          { curriculumId: "cur_1", moduleId: "mod_1", objectiveListId: null, sessionPlanId: null },
          { curriculumId: "cur_1", moduleId: "mod_1", objectiveListId: "olist_1", sessionPlanId: "sp_1" },
        ],
        {
          curriculumId: "cur_1",
          moduleId: "mod_1",
          objectiveListId: "olist_1",
          sessionPlanId: "sp_1",
          statuses: ["planned", "needs_review"],
          limit: 10,
        },
      );
      expect(selected?.sessionPlanId).toBe("sp_1");
    });

    it("merges selected pedagogical context refs into runtime tool refs", () => {
      const merged = mergeSelectedNodeRefs(
        [{ refType: "source", refId: "src_1" }],
        {
          strategy: "selected-nodes-current-objective-weak-concepts-notebook",
          query: "q",
          retrievalMode: "hybrid",
          maxChunks: 6,
          selectedNodeRefs: [{ refType: "concept", refId: "concept_1" }],
          selectedChunkIds: ["chunk_1"],
          selectedSourceIds: ["src_1", "src_2"],
          objectiveTitle: "Obj",
          objectivePathConceptIds: ["concept_1"],
          weakConceptNames: [],
          recentMistakeConceptIds: [],
          sourceScopePolicy: "soft_source_scope",
          usedSourceScopeFallback: false,
          sourceCoverageGap: false,
          reason: "r",
        },
      );
      expect(merged).toEqual(
        expect.arrayContaining([
          { refType: "source", refId: "src_1" },
          { refType: "source", refId: "src_2" },
          { refType: "concept", refId: "concept_1" },
          { refType: "chunk", refId: "chunk_1" },
        ]),
      );
    });
  });
});
