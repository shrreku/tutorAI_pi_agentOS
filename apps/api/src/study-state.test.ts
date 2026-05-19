import { describe, expect, it } from "vitest";
import { pickPreferredPlanningRow, selectPreferredCoverageRow } from "./study-state.js";

describe("pickPreferredPlanningRow", () => {
  it("returns the preferred row when it is present", () => {
    const rows = [
      { id: "row_new", updatedAt: new Date("2026-05-05T10:00:00Z") },
      { id: "row_old", updatedAt: new Date("2026-05-01T10:00:00Z") },
    ];

    expect(pickPreferredPlanningRow(rows, "row_old")?.id).toBe("row_old");
  });

  it("falls back to the freshest row when the preferred row is stale or missing", () => {
    const rows = [
      { id: "row_old", updatedAt: new Date("2026-05-01T10:00:00Z") },
      { id: "row_new", updatedAt: new Date("2026-05-05T10:00:00Z") },
    ];

    expect(pickPreferredPlanningRow(rows, "missing")?.id).toBe("row_new");
    expect(pickPreferredPlanningRow(rows, null)?.id).toBe("row_new");
  });

  it("still prefers the active row when rows arrive out of order", () => {
    const rows = [
      { id: "row_old", updatedAt: new Date("2026-05-01T10:00:00Z") },
      { id: "row_new", updatedAt: new Date("2026-05-05T10:00:00Z") },
    ];

    expect(pickPreferredPlanningRow(rows, "row_old")?.id).toBe("row_old");
  });

  it("prefers active status over fresher draft rows when no preferred id is provided", () => {
    const rows = [
      { id: "row_fresh_draft", status: "draft", updatedAt: new Date("2026-05-05T10:00:00Z") },
      { id: "row_active_old", status: "active", updatedAt: new Date("2026-05-01T10:00:00Z") },
    ];
    expect(pickPreferredPlanningRow(rows, null)?.id).toBe("row_active_old");
  });
});

describe("selectPreferredCoverageRow", () => {
  it("prefers the most specific matching scoped row", () => {
    const rows = [
      {
        curriculumId: "cur_1",
        moduleId: null,
        objectiveListId: null,
        sessionPlanId: null,
        updatedAt: new Date("2026-05-01T10:00:00Z"),
      },
      {
        curriculumId: "cur_1",
        moduleId: "mod_1",
        objectiveListId: null,
        sessionPlanId: null,
        updatedAt: new Date("2026-05-01T11:00:00Z"),
      },
      {
        curriculumId: "cur_1",
        moduleId: "mod_1",
        objectiveListId: "olist_1",
        sessionPlanId: "sp_1",
        updatedAt: new Date("2026-05-01T12:00:00Z"),
      },
    ];
    const picked = selectPreferredCoverageRow(rows, {
      curriculumId: "cur_1",
      moduleId: "mod_1",
      objectiveListId: "olist_1",
      sessionPlanId: "sp_1",
    });
    expect(picked?.sessionPlanId).toBe("sp_1");
  });

  it("falls back to latest compatible row when specificity ties", () => {
    const rows = [
      {
        curriculumId: "cur_1",
        moduleId: "mod_1",
        objectiveListId: null,
        sessionPlanId: null,
        updatedAt: new Date("2026-05-01T10:00:00Z"),
      },
      {
        curriculumId: "cur_1",
        moduleId: "mod_1",
        objectiveListId: null,
        sessionPlanId: null,
        updatedAt: new Date("2026-05-01T12:00:00Z"),
      },
    ];
    const picked = selectPreferredCoverageRow(rows, {
      curriculumId: "cur_1",
      moduleId: "mod_1",
      objectiveListId: null,
      sessionPlanId: null,
    });
    expect(picked?.updatedAt.toISOString()).toBe("2026-05-01T12:00:00.000Z");
  });

  it("falls back to module scope when objective/session scopes mismatch", () => {
    const rows = [
      {
        curriculumId: "cur_1",
        moduleId: "mod_1",
        objectiveListId: "olist_x",
        sessionPlanId: "sp_x",
        updatedAt: new Date("2026-05-01T10:00:00Z"),
      },
      {
        curriculumId: "cur_1",
        moduleId: "mod_1",
        objectiveListId: null,
        sessionPlanId: null,
        updatedAt: new Date("2026-05-01T11:00:00Z"),
      },
    ];
    const picked = selectPreferredCoverageRow(rows, {
      curriculumId: "cur_1",
      moduleId: "mod_1",
      objectiveListId: "olist_1",
      sessionPlanId: "sp_1",
    });
    expect(picked?.objectiveListId).toBeNull();
    expect(picked?.sessionPlanId).toBeNull();
  });
});