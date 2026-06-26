import { describe, expect, it, vi, beforeEach } from "vitest";

const { claimNextIngestionJob, completeIngestionJob } = vi.hoisted(() => ({
  claimNextIngestionJob: vi.fn(),
  completeIngestionJob: vi.fn(),
}));

vi.mock("@studyagent/db", () => ({
  claimNextIngestionJob,
  completeIngestionJob,
  failIngestionJob: vi.fn(),
  appendEvent: vi.fn(),
  notebooks: { ownerId: "owner_id", id: "id" },
  createDb: vi.fn(),
}));

vi.mock("@studyagent/observability", () => ({
  recordIngestionJobMetric: vi.fn(),
  startMetricTimer: vi.fn(() => () => 0),
}));

vi.mock("./ingestion-pipeline.js", () => ({
  processIngestionPipelineJob: vi.fn(async () => undefined),
}));

import { MAX_CONSECUTIVE_LEARNER_SKIPS, runOneShotDrain } from "./one-shot-drain.js";

const env = {
  DATABASE_URL: "postgres://test",
  OBJECT_STORAGE_ENDPOINT: undefined,
  OBJECT_STORAGE_ACCESS_KEY: undefined,
  OBJECT_STORAGE_SECRET_KEY: undefined,
  OBJECT_STORAGE_REGION: "us-east-1",
} as never;

const claimedJob = {
  id: "job_1",
  jobName: "ingest",
  notebookId: "nb_1",
  sourceId: "src_1",
  sourceVersionId: "sv_1",
  attemptsStarted: 1,
};

function createDbClient(otherRunningJob: boolean) {
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{ ownerId: "usr_1" }]),
          })),
        })),
      })),
      execute: vi.fn(async () => (otherRunningJob ? [{}] : [])),
    },
    sql: { end: vi.fn(async () => undefined) },
  };
}

describe("runOneShotDrain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimNextIngestionJob.mockResolvedValue(claimedJob);
    completeIngestionJob.mockResolvedValue(undefined);
  });

  it("stops after max consecutive learner guard skips", async () => {
    const dbClient = createDbClient(true);

    const result = await runOneShotDrain(env, {
      maxJobs: 50,
      dbClient: dbClient as never,
      workerId: "test_worker",
    });

    expect(claimNextIngestionJob).toHaveBeenCalledTimes(MAX_CONSECUTIVE_LEARNER_SKIPS);
    expect(result).toMatchObject({
      jobsClaimed: MAX_CONSECUTIVE_LEARNER_SKIPS,
      jobsCompleted: 0,
      jobsFailed: 0,
      jobsSkipped: MAX_CONSECUTIVE_LEARNER_SKIPS,
    });
    expect(completeIngestionJob).not.toHaveBeenCalled();
  });

  it("breaks when no progress is made within maxJobs attempts", async () => {
    const dbClient = createDbClient(true);

    const result = await runOneShotDrain(env, {
      maxJobs: 3,
      dbClient: dbClient as never,
      workerId: "test_worker",
    });

    expect(claimNextIngestionJob).toHaveBeenCalledTimes(3);
    expect(result.jobsSkipped).toBe(3);
    expect(result.jobsCompleted).toBe(0);
  });

  it("processes jobs when learner guard passes", async () => {
    const dbClient = createDbClient(false);
    claimNextIngestionJob
      .mockResolvedValueOnce(claimedJob)
      .mockResolvedValueOnce({ ...claimedJob, id: "job_2" })
      .mockResolvedValueOnce(null);

    const result = await runOneShotDrain(env, {
      maxJobs: 2,
      dbClient: dbClient as never,
      workerId: "test_worker",
    });

    expect(result).toMatchObject({
      jobsClaimed: 2,
      jobsCompleted: 2,
      jobsFailed: 0,
      jobsSkipped: 0,
    });
    expect(completeIngestionJob).toHaveBeenCalledTimes(2);
  });
});
