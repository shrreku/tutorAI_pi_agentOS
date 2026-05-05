import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import type { AppContext } from "./context.js";

export async function ensureObjectStorageBucket(ctx: AppContext): Promise<void> {
  if (!ctx.s3) {
    return;
  }

  const bucket = ctx.env.OBJECT_STORAGE_BUCKET;

  try {
    await ctx.s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch {
    // Bucket missing or not accessible; try to create (MinIO / local S3).
  }

  await ctx.s3.send(new CreateBucketCommand({ Bucket: bucket }));
}
