import { describe, expect, it, vi } from "vitest";
import { ingestionTriggerRuns } from "@studyagent/db";
import type { AppContext } from "../context.js";
import { triggerIngestionWorker } from "./ingestion-trigger.js";

vi.mock("@studyagent/worker/one-shot-drain.js", () => ({
  runOneShotDrain: vi.fn(async () => ({
    jobsClaimed: 1,
    jobsCompleted: 1,
    jobsFailed: 0,
  })),
}));

function createTriggerContext(
  mode: "inline" | "external" | "disabled",
  external?: {
    url?: string;
    token?: string;
    maxJobs?: number;
    minIntervalSeconds?: number;
    recentTriggerId?: string;
  },
) {
  const triggerRows: Array<Record<string, unknown>> = [];
  const db = {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                orderBy() {
                  return {
                    limit() {
                      return Promise.resolve(
                        external?.recentTriggerId ? [{ id: external.recentTriggerId }] : [],
                      );
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(row: Record<string, unknown>) {
          if (table === ingestionTriggerRuns) {
            triggerRows.push(row);
          }
          return Promise.resolve(undefined);
        },
      };
    },
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where() {
              if (table === ingestionTriggerRuns && triggerRows[0]) {
                Object.assign(triggerRows[0], values);
              }
              return Promise.resolve(undefined);
            },
          };
        },
      };
    },
  };

  return {
    ctx: {
      env: {
        INGESTION_TRIGGER_MODE: mode,
        INGESTION_TRIGGER_URL: external?.url,
        INGESTION_TRIGGER_TOKEN: external?.token,
        INGESTION_TRIGGER_MAX_JOBS: external?.maxJobs ?? 5,
        INGESTION_TRIGGER_MIN_INTERVAL_SECONDS: external?.minIntervalSeconds ?? 0,
      },
      db: { db },
    } as unknown as AppContext,
    triggerRows,
  };
}

function parseFetchBody(fetchMock: ReturnType<typeof vi.fn>): { command?: string[] } {
  const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(String(firstCall[1].body)) as { command?: string[] };
}

describe("triggerIngestionWorker", () => {
  it("records a skipped run when trigger mode is disabled", async () => {
    const { ctx, triggerRows } = createTriggerContext("disabled");
    const result = await triggerIngestionWorker(ctx, "upload", "usr_1");
    expect(result.status).toBe("skipped");
    expect(triggerRows).toHaveLength(1);
  });

  it("runs inline drain and records completion", async () => {
    const { ctx, triggerRows } = createTriggerContext("inline");
    const result = await triggerIngestionWorker(ctx, "upload", "usr_1");
    expect(result.status).toBe("completed");
    expect(result.jobsClaimed).toBe(1);
    expect(triggerRows[0]?.status).toBe("completed");
  });

  it("invokes the configured external one-shot worker trigger", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const { ctx } = createTriggerContext("external", {
      url: "https://jobs.example.test/ingestion",
      token: "trigger-secret",
    });
    const result = await triggerIngestionWorker(ctx, "admin_manual", "adm_1");
    expect(result.status).toBe("started");
    expect(result.runId).toMatch(/^itr_/);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://jobs.example.test/ingestion",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer trigger-secret",
        }),
      }),
    );
    const body = parseFetchBody(fetchMock);
    expect(body.command).toEqual(["--one-shot", "--max-jobs=5"]);
    vi.unstubAllGlobals();
  });

  it("uses the configured one-shot batch size", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const { ctx } = createTriggerContext("external", {
      url: "https://jobs.example.test/ingestion",
      token: "trigger-secret",
      maxJobs: 2,
    });
    await triggerIngestionWorker(ctx, "upload", "usr_1");
    const body = parseFetchBody(fetchMock);
    expect(body.command).toEqual(["--one-shot", "--max-jobs=2"]);
    vi.unstubAllGlobals();
  });

  it("debounces non-admin triggers when a recent run exists", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const { ctx, triggerRows } = createTriggerContext("external", {
      url: "https://jobs.example.test/ingestion",
      token: "trigger-secret",
      minIntervalSeconds: 300,
      recentTriggerId: "itr_recent",
    });
    const result = await triggerIngestionWorker(ctx, "upload", "usr_1");
    expect(result.status).toBe("skipped");
    expect(result.error).toContain("itr_recent");
    expect(triggerRows[0]?.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("records external trigger failures", async () => {
    const fetchMock = vi.fn(async () => new Response("provider unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const { ctx, triggerRows } = createTriggerContext("external", {
      url: "https://jobs.example.test/ingestion",
      token: "trigger-secret",
    });
    const result = await triggerIngestionWorker(ctx, "upload", "usr_1");
    expect(result.status).toBe("failed");
    expect(result.error).toContain("503");
    expect(triggerRows[0]?.status).toBe("failed");
    vi.unstubAllGlobals();
  });
});
