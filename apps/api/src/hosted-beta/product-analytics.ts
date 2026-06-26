import { and, eq } from "drizzle-orm";
import { betaConsents, trackProductEvent, users, type ProductEventInput } from "@studyagent/db";
import type { AppContext } from "../context.js";
import { mirrorToPostHog } from "./posthog-mirror.js";

export async function recordProductAnalytics(
  ctx: AppContext,
  input: ProductEventInput,
): Promise<{ id: string }> {
  const result = await trackProductEvent(ctx.db, input);
  const distinctId = input.userId ?? "anonymous";

  let identifyProperties: Record<string, unknown> = {};
  if (input.userId) {
    const [consent] = await ctx.db.db
      .select({ id: betaConsents.id })
      .from(betaConsents)
      .where(
        and(
          eq(betaConsents.userId, input.userId),
          eq(betaConsents.consentVersion, ctx.env.BETA_CONSENT_VERSION),
        ),
      )
      .limit(1);
    if (!consent) {
      return result;
    }

    const [user] = await ctx.db.db
      .select({ email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (user) {
      identifyProperties = {
        email: user.email,
        name: user.displayName ?? user.email,
      };
    }
  }

  await mirrorToPostHog(ctx.env, {
    event: input.eventName,
    distinctId,
    properties: input.properties ?? {},
    personProperties: identifyProperties,
  });

  return result;
}
