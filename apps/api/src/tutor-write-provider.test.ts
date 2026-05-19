import { describe, expect, it } from "vitest";
import {
  resolveArtifactLifecycleOutcome,
  resolveArtifactConsentPolicy,
} from "./artifact-lifecycle.js";
import {
  findCoverageRecordForScope,
  sanitizeArtifactSourceNodeRefs,
  selectPreferredCoverageGapRow,
} from "./tutor-write-provider.js";

describe("findCoverageRecordForScope", () => {
  it("matches only the exact scope tuple including nulls", () => {
    const rows = [
      {
        id: "covrec_global",
        curriculumId: null,
        moduleId: null,
        objectiveListId: null,
        sessionPlanId: null,
      },
      {
        id: "covrec_module",
        curriculumId: "cur_1",
        moduleId: "mod_1",
        objectiveListId: null,
        sessionPlanId: null,
      },
      {
        id: "covrec_session",
        curriculumId: "cur_1",
        moduleId: "mod_1",
        objectiveListId: "objlist_1",
        sessionPlanId: "sess_1",
      },
    ];

    const match = findCoverageRecordForScope(rows, {
      curriculumId: "cur_1",
      moduleId: "mod_1",
      objectiveListId: "objlist_1",
      sessionPlanId: "sess_1",
    });
    const global = findCoverageRecordForScope(rows, {
      curriculumId: null,
      moduleId: null,
      objectiveListId: null,
      sessionPlanId: null,
    });
    const noMatch = findCoverageRecordForScope(rows, {
      curriculumId: "cur_1",
      moduleId: "mod_1",
      objectiveListId: "objlist_2",
      sessionPlanId: "sess_1",
    });

    expect(match?.id).toBe("covrec_session");
    expect(global?.id).toBe("covrec_global");
    expect(noMatch).toBeUndefined();
  });

  it("normalizes empty/undefined scope values to null for matching", () => {
    const rows = [
      {
        id: "covrec_null_scope",
        curriculumId: null,
        moduleId: null,
        objectiveListId: null,
        sessionPlanId: null,
      },
    ];

    const byUndefined = findCoverageRecordForScope(rows, {
      curriculumId: null,
      moduleId: null,
      objectiveListId: null,
      sessionPlanId: null,
    });

    const byEmptyString = findCoverageRecordForScope(rows, {
      curriculumId: "",
      moduleId: "",
      objectiveListId: "",
      sessionPlanId: "",
    });

    expect(byUndefined?.id).toBe("covrec_null_scope");
    expect(byEmptyString?.id).toBe("covrec_null_scope");
  });

  it("does not cross-match partial scope tuples", () => {
    const rows = [
      {
        id: "covrec_curriculum_only",
        curriculumId: "cur_1",
        moduleId: null,
        objectiveListId: null,
        sessionPlanId: null,
      },
      {
        id: "covrec_module_scoped",
        curriculumId: "cur_1",
        moduleId: "mod_1",
        objectiveListId: null,
        sessionPlanId: null,
      },
    ];

    const curriculumScope = findCoverageRecordForScope(rows, {
      curriculumId: "cur_1",
      moduleId: null,
      objectiveListId: null,
      sessionPlanId: null,
    });

    const moduleScope = findCoverageRecordForScope(rows, {
      curriculumId: "cur_1",
      moduleId: "mod_1",
      objectiveListId: null,
      sessionPlanId: null,
    });

    expect(curriculumScope?.id).toBe("covrec_curriculum_only");
    expect(moduleScope?.id).toBe("covrec_module_scoped");
  });
});

describe("resolveArtifactConsentPolicy", () => {
  it("uses explicit per-type policy when configured", () => {
    const policy = resolveArtifactConsentPolicy(
      {
        perType: {
          worked_example: "auto_create",
          comparison_page: "draft_only",
        },
      },
      "worked_example",
    );
    const second = resolveArtifactConsentPolicy(
      {
        perType: {
          worked_example: "auto_create",
          comparison_page: "draft_only",
        },
      },
      "comparison_page",
    );
    expect(policy).toBe("auto_create");
    expect(second).toBe("draft_only");
  });

  it("falls back to propose for missing or invalid policies", () => {
    expect(resolveArtifactConsentPolicy({}, "formula_sheet")).toBe("propose");
    expect(
      resolveArtifactConsentPolicy(
        {
          perType: {
            formula_sheet: "unknown",
          },
        },
        "formula_sheet",
      ),
    ).toBe("propose");
  });
});

describe("resolveArtifactLifecycleOutcome", () => {
  it("uses lifecycle policy helpers to keep draft-only artifacts hidden", () => {
    const result = resolveArtifactLifecycleOutcome({
      artifactType: "formula_sheet",
      artifactConsent: {
        perType: {
          formula_sheet: "draft_only",
        },
      },
      payload: {
        formulas: [{ expression: "F = ma", meaning: "Force equals mass times acceleration." }],
      },
      sourceRefs: [{ refType: "chunk", refId: "chunk_1" }],
    });

    expect(result.lifecycle.status).toBe("draft");
    expect(result.lifecycle.visibility).toBe("hidden");
    expect(result.lifecycle.approvalRequired).toBe(false);
    expect(result.lifecycle.transition).toMatchObject({ from: "draft", to: "draft", valid: true });
    expect(result.quality.needsReview).toBe(true);
    expect(result.quality.issues).toContain("Needs review before treating it as final.");
  });

  it("downgrades auto-created artifacts that fail ready quality gates", () => {
    const result = resolveArtifactLifecycleOutcome({
      artifactType: "quiz",
      artifactConsent: { autoCreateLearnerArtifacts: true },
      payload: {
        questions: [{ prompt: "What is force?", answer: "Mass times acceleration.", conceptIds: [] }],
      },
      sourceRefs: [],
    });

    expect(result.lifecycle.requestedStatus).toBe("ready");
    expect(result.lifecycle.status).toBe("proposed");
    expect(result.lifecycle.visibility).toBe("learner");
    expect(result.lifecycle.approvalRequired).toBe(true);
    expect(result.lifecycle.qualityGate).toEqual({ canBecomeReady: false, downgradedFromReady: true });
    expect(result.quality.issues).toEqual(
      expect.arrayContaining(["Needs source support.", "Needs review before treating it as final."]),
    );
    expect(result.warnings.map((warning) => warning.code)).toContain("artifact_quality_gate_failed");
  });

  it("allows high-quality source-backed auto-created notes to become ready", () => {
    const result = resolveArtifactLifecycleOutcome({
      artifactType: "note",
      artifactConsent: { autoCreateNotes: true },
      payload: {
        markdown: `${"This note connects acceleration, force, and mass with a concrete study explanation. ".repeat(7)}Use it to remember that the relationship is proportional when mass is fixed.`,
        keyPoints: ["Force changes with mass and acceleration."],
      },
      sourceRefs: [{ refType: "chunk", refId: "chunk_1" }],
    });

    expect(result.lifecycle.status).toBe("ready");
    expect(result.lifecycle.visibility).toBe("learner");
    expect(result.lifecycle.approvalRequired).toBe(false);
    expect(result.quality).toMatchObject({
      sourceBacked: true,
      needsReview: false,
      canBecomeReady: true,
    });
    expect(result.warnings).toEqual([]);
  });
});

describe("selectPreferredCoverageGapRow", () => {
  it("prefers session-plan scoped rows for matching requests", () => {
    const rows = [
      {
        curriculumId: "cur_1",
        moduleId: "mod_1",
        objectiveListId: null,
        sessionPlanId: null,
      },
      {
        curriculumId: "cur_1",
        moduleId: "mod_1",
        objectiveListId: "olist_1",
        sessionPlanId: "sp_1",
      },
    ];
    const selected = selectPreferredCoverageGapRow(rows, {
      curriculumId: "cur_1",
      moduleId: "mod_1",
      objectiveListId: "olist_1",
      sessionPlanId: "sp_1",
      statuses: ["planned"],
      limit: 10,
    });
    expect(selected?.sessionPlanId).toBe("sp_1");
  });

  it("returns null when no rows are compatible with requested scope", () => {
    const rows = [
      {
        curriculumId: "cur_2",
        moduleId: "mod_2",
        objectiveListId: null,
        sessionPlanId: null,
      },
    ];
    const selected = selectPreferredCoverageGapRow(rows, {
      curriculumId: "cur_1",
      moduleId: "mod_1",
      objectiveListId: undefined,
      sessionPlanId: undefined,
      statuses: ["planned"],
      limit: 10,
    });
    expect(selected).toBeNull();
  });
});

describe("sanitizeArtifactSourceNodeRefs", () => {
  it("drops unsupported ref types before querying", async () => {
    const fakeDbClient = {
      db: {
        select() {
          throw new Error("should not query for unsupported refs");
        },
      },
    } as any;
    const result = await sanitizeArtifactSourceNodeRefs(fakeDbClient, "nb_1", [
      { refType: "objective", refId: "obj_1" },
    ]);
    expect(result.refs).toEqual([]);
    expect(result.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["source_ref_type_unsupported"]));
  });

  it("deduplicates refs and keeps only notebook-scoped rows", async () => {
    const fakeDbClient = {
      db: {
        select() {
          return {
            from() {
              return {
                innerJoin() {
                  return this;
                },
                where() {
                  return Promise.resolve([{ id: "chunk_1" }]);
                },
              };
            },
          };
        },
      },
    } as any;
    const result = await sanitizeArtifactSourceNodeRefs(fakeDbClient, "nb_1", [
      { refType: "chunk", refId: "chunk_1" },
      { refType: "chunk", refId: "chunk_1" },
    ]);
    expect(result.refs).toEqual([{ refType: "chunk", refId: "chunk_1" }]);
  });
});
