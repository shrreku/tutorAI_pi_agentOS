import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "./client.js";
import { enqueueGenerationJob, findGenerationJobByIdempotencyKey } from "./generation-jobs.js";
import { notebooks, users } from "./schema/index.js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://studyagent:studyagent@127.0.0.1:5433/studyagent";
const shouldRun = process.env.RUN_POSTGRES_INTEGRATION === "1";

describe("generation jobs", () => {
  it("enforces notebook idempotency keys", async () => {
    if (!shouldRun) return;
    const dbClient = createDb(DATABASE_URL);
    const suffix = `${Date.now()}`;
    const notebookId = `nb_gjob_${suffix}`;
    const userId = `usr_gjob_${suffix}`;
    const now = new Date();
    try {
      await dbClient.db.insert(users).values({
        id: userId,
        email: `gjob_${suffix}@example.com`,
        displayName: "Generation Job Test",
        settingsJson: {},
        createdAt: now,
        updatedAt: now,
      });
      await dbClient.db.insert(notebooks).values({
        id: notebookId,
        ownerId: userId,
        title: "Generation Job Notebook",
        defaultMode: "explore",
        settingsJson: {},
        createdAt: now,
        updatedAt: now,
      });

      const first = await enqueueGenerationJob(dbClient, {
        jobName: "initial_build",
        notebookId,
        idempotencyKey: `idem_${suffix}`,
        targetType: "initial_build",
        generationMode: "initial_build",
        trigger: "initial_build",
        payloadJson: { moduleId: "mod_1" },
      });
      const second = await enqueueGenerationJob(dbClient, {
        jobName: "initial_build",
        notebookId,
        idempotencyKey: `idem_${suffix}`,
        targetType: "initial_build",
        generationMode: "initial_build",
        trigger: "initial_build",
        payloadJson: { moduleId: "mod_1" },
      });

      expect(second.id).toBe(first.id);
      const found = await findGenerationJobByIdempotencyKey(dbClient, {
        notebookId,
        idempotencyKey: `idem_${suffix}`,
      });
      expect(found?.id).toBe(first.id);
    } finally {
      await dbClient.db.delete(notebooks).where(eq(notebooks.id, notebookId));
      await dbClient.sql.end();
    }
  });
});
