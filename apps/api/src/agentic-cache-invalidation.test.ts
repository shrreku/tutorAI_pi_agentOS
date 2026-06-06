import { beforeEach, describe, expect, it, vi } from "vitest";

const { appendEventMock, invalidateAgenticCacheScopeMock } = vi.hoisted(() => ({
  appendEventMock: vi.fn(async () => ({ id: "evt_1", sequenceNo: 1 })),
  invalidateAgenticCacheScopeMock: vi.fn(async () => 1),
}));

vi.mock("@studyagent/db", async () => {
  const actual = await vi.importActual<typeof import("@studyagent/db")>("@studyagent/db");
  return {
    ...actual,
    appendEvent: appendEventMock,
    invalidateAgenticCacheScope: invalidateAgenticCacheScopeMock,
  };
});

import {
  appendEventWithTutorCacheInvalidation,
  invalidateTutorReadCachesForNotebookEvent,
  selectTutorReadCacheNamespacesForEvent,
  TUTOR_AGENTIC_CACHE_NAMESPACES,
} from "./agentic-cache-invalidation.js";

describe("agentic tutor cache invalidation", () => {
  beforeEach(() => {
    appendEventMock.mockClear();
    invalidateAgenticCacheScopeMock.mockClear();
    invalidateAgenticCacheScopeMock.mockResolvedValue(1);
  });

  it("invalidates retrieval rows for source corpus events", async () => {
    const result = await invalidateTutorReadCachesForNotebookEvent({} as never, {
      notebookId: "nb_1",
      eventType: "source.tutoring_ready",
    });

    expect(result).toMatchObject({
      deleted: 1,
      errors: [],
      skipped: false,
      namespaces: [TUTOR_AGENTIC_CACHE_NAMESPACES.retrievalRows],
    });
    expect(invalidateAgenticCacheScopeMock).toHaveBeenCalledWith({}, {
      namespace: TUTOR_AGENTIC_CACHE_NAMESPACES.retrievalRows,
      scopeType: "notebook",
      scopeId: "nb_1",
    });
  });

  it("does not invalidate tutor read caches for profile-only events anymore", async () => {
    expect(selectTutorReadCacheNamespacesForEvent("student_profile.updated")).toEqual([]);
  });

  it("does not invalidate wiki.search retrieval rows for planning-only events", async () => {
    const namespaces = selectTutorReadCacheNamespacesForEvent("objective.updated");

    expect(namespaces).toEqual([]);
  });

  it("skips non-material tutor stream events", async () => {
    const result = await invalidateTutorReadCachesForNotebookEvent({} as never, {
      notebookId: "nb_1",
      eventType: "tutor.message.delta",
    });

    expect(result).toEqual({ deleted: 0, errors: [], namespaces: [], skipped: true });
    expect(invalidateAgenticCacheScopeMock).not.toHaveBeenCalled();
  });

  it("does not fail appendEvent when cache deletion fails", async () => {
    invalidateAgenticCacheScopeMock.mockRejectedValueOnce(new Error("cache unavailable"));

    await expect(
      appendEventWithTutorCacheInvalidation({} as never, {
        notebookId: "nb_1",
        eventType: "student_profile.updated",
        payload: {},
      }),
    ).resolves.toEqual({ id: "evt_1", sequenceNo: 1 });
    expect(appendEventMock).toHaveBeenCalled();
    expect(invalidateAgenticCacheScopeMock).not.toHaveBeenCalled();
  });
});
