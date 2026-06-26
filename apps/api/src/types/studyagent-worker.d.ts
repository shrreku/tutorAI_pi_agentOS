declare module "@studyagent/worker/one-shot-drain.js" {
  import type { loadEnv } from "@studyagent/config";
  import type { DbClient } from "@studyagent/db";

  export type OneShotDrainResult = {
    jobsClaimed: number;
    jobsCompleted: number;
    jobsFailed: number;
    jobsSkipped: number;
  };

  export function runOneShotDrain(
    env: ReturnType<typeof loadEnv>,
    options?: {
      maxJobs?: number;
      dbClient?: DbClient;
      workerId?: string;
    },
  ): Promise<OneShotDrainResult>;
}
