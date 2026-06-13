import { learnerTraitValueByKeySchema, type LearnerTraitKey } from "@studyagent/schemas";
import type { StudentProfileUpdatePreferencesInput } from "@studyagent/tools";
import type { AppContext } from "./context.js";
import { recordLearnerTraitSignal } from "./learner-trait-store.js";
import { readStudentProfile, upsertStudentProfile } from "./student-profile.js";

export type PersonalizationPreferenceKey = "pace" | "depth" | "examples" | "assessment" | "urgency";

const PREFERENCE_TO_TRAIT: Record<PersonalizationPreferenceKey, LearnerTraitKey | null> = {
  pace: "pacePreference",
  depth: "depthPreference",
  examples: "examplePreference",
  assessment: "assessmentPreference",
  urgency: "urgencyContext",
};

const PERSONALIZATION_VALUE_ALIASES: Record<string, string> = {
  slower: "slow",
  faster: "fast",
  overview: "intuitive",
  deep: "formal",
  fewer: "concrete",
  more: "visual",
  light: "checkpoint",
  rigorous: "quiz",
  relaxed: "exploratory",
};

export function normalizePersonalizationPreferenceValue(
  preference: PersonalizationPreferenceKey,
  value: string,
): string {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliased = PERSONALIZATION_VALUE_ALIASES[normalized] ?? normalized;
  const trait = PREFERENCE_TO_TRAIT[preference];
  if (!trait) {
    return aliased;
  }
  const parsed = learnerTraitValueByKeySchema.safeParse({ trait, value: aliased });
  return parsed.success ? parsed.data.value : aliased;
}

export function personalizationPatchFromAction(input: {
  preference: PersonalizationPreferenceKey;
  value: string;
}): StudentProfileUpdatePreferencesInput {
  const value = normalizePersonalizationPreferenceValue(input.preference, input.value);
  switch (input.preference) {
    case "pace":
      return { pacePreference: value };
    case "depth":
      return { depthPreference: value };
    case "examples":
      return { examplePreferencesJson: { preference: value } };
    case "assessment":
      return { assessmentPreferenceJson: { preference: value } };
    case "urgency":
      return { constraintsJson: { urgency: value } };
  }
}

export async function persistPersonalizationPreference(
  ctx: AppContext,
  input: {
    notebookId: string;
    userId: string;
    preference: PersonalizationPreferenceKey;
    value: string;
    sessionId?: string;
    runId?: string;
  },
): Promise<void> {
  const normalizedValue = normalizePersonalizationPreferenceValue(input.preference, input.value);
  const patch = personalizationPatchFromAction({
    preference: input.preference,
    value: normalizedValue,
  });
  const result = await upsertStudentProfile(ctx.db, {
    notebookId: input.notebookId,
    userId: input.userId,
    patch,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
  });

  const trait = PREFERENCE_TO_TRAIT[input.preference];
  const parsedTraitValue = trait
    ? learnerTraitValueByKeySchema.safeParse({ trait, value: normalizedValue })
    : null;
  if (trait && parsedTraitValue?.success) {
    await recordLearnerTraitSignal(ctx.db, {
      id: `lts_${crypto.randomUUID().replaceAll("-", "")}`,
      notebookId: input.notebookId,
      userId: input.userId,
      source: "onboarding_profile",
      trait,
      suggestedValue: parsedTraitValue.data.value,
      strength: 0.95,
      confidence: 0.95,
      evidenceRefs: [{ refType: "student_profile", refId: result.profile.id }],
      internalVisibility: true,
      observedAt: new Date().toISOString(),
      notes: "Learner-facing interactive personalization control update.",
    } as Parameters<typeof recordLearnerTraitSignal>[1]);
  }
}

export async function loadPersonalizationCanonicalState(
  ctx: AppContext,
  notebookId: string,
  userId: string,
): Promise<Record<string, unknown>> {
  const profile = await readStudentProfile(ctx.db, notebookId, userId);
  if (!profile) {
    return { updatedPreferences: [] };
  }
  return {
    updatedPreferences: [
      profile.pacePreference ? { preference: "pace", value: profile.pacePreference } : null,
      profile.depthPreference ? { preference: "depth", value: profile.depthPreference } : null,
      profile.examplePreferencesJson?.preference
        ? { preference: "examples", value: String(profile.examplePreferencesJson.preference) }
        : null,
      profile.assessmentPreferenceJson?.preference
        ? { preference: "assessment", value: String(profile.assessmentPreferenceJson.preference) }
        : null,
      profile.constraintsJson?.urgency
        ? { preference: "urgency", value: String(profile.constraintsJson.urgency) }
        : null,
    ].filter(Boolean),
  };
}
