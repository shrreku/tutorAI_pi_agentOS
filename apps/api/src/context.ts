import type { StudyAgentEnv } from "@studyagent/config";
import { createDb, type DbClient } from "@studyagent/db";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { S3Client } from "@aws-sdk/client-s3";

export type AppContext = {
  env: StudyAgentEnv;
  db: DbClient;
  ingestionQueue: Queue | null;
  s3: S3Client | null;
  redis: Redis | null;
};

export function createContext(env: StudyAgentEnv): AppContext {
  const db = createDb(env.DATABASE_URL);

  let redis: Redis | null = null;
  let ingestionQueue: Queue | null = null;

  if (env.REDIS_URL) {
    redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    ingestionQueue = new Queue("ingestion", { connection: redis });
  }

  const s3 =
    env.OBJECT_STORAGE_ENDPOINT && env.OBJECT_STORAGE_ACCESS_KEY && env.OBJECT_STORAGE_SECRET_KEY
      ? new S3Client({
          region: env.OBJECT_STORAGE_REGION,
          endpoint: env.OBJECT_STORAGE_ENDPOINT,
          credentials: {
            accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY,
            secretAccessKey: env.OBJECT_STORAGE_SECRET_KEY,
          },
          forcePathStyle: true,
        })
      : null;

  return { env, db, ingestionQueue, s3, redis };
}

export async function closeContext(ctx: AppContext): Promise<void> {
  await ctx.ingestionQueue?.close();
  await ctx.redis?.quit();
  await ctx.db.sql.end();
}
