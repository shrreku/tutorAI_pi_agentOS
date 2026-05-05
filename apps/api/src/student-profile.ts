import { and, eq } from "drizzle-orm";
import { appendEvent, studentProfiles, type DbClient } from "@studyagent/db";
import type { StudentProfileUpdatePreferencesInput } from "@studyagent/tools";

export type StudentProfileRecord = {
  id: string;
  notebookId: string;
  userId: string;
  goalSummary: string | null;
  backgroundSummary: string | null;
  pacePreference: string | null;
  depthPreference: string | null;
  examplePreferencesJson: Record<string, unknown>;
  assessmentPreferenceJson: Record<string, unknown>;
  constraintsJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export async function readStudentProfile(
  dbClient: DbClient,
  notebookId: string,
  userId: string,
): Promise<StudentProfileRecord | null> {
  const [row] = await dbClient.db
    .select()
    .from(studentProfiles)
    .where(and(eq(studentProfiles.notebookId, notebookId), eq(studentProfiles.userId, userId)))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    notebookId: row.notebookId,
    userId: row.userId,
    goalSummary: row.goalSummary ?? null,
    backgroundSummary: row.backgroundSummary ?? null,
    pacePreference: row.pacePreference ?? null,
    depthPreference: row.depthPreference ?? null,
    examplePreferencesJson: row.examplePreferencesJson ?? {},
    assessmentPreferenceJson: row.assessmentPreferenceJson ?? {},
    constraintsJson: row.constraintsJson ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function upsertStudentProfile(
  dbClient: DbClient,
  input: {
    notebookId: string;
    userId: string;
    patch: StudentProfileUpdatePreferencesInput;
    runId?: string;
    sessionId?: string;
    traceId?: string;
  },
): Promise<{ profile: StudentProfileRecord; eventId: string }> {
  const now = new Date();
  const existing = await readStudentProfile(dbClient, input.notebookId, input.userId);
  const profileId = existing?.id ?? `sprof_${crypto.randomUUID().replaceAll("-", "")}`;

  const nextProfile = {
    goalSummary: input.patch.goalSummary ?? existing?.goalSummary ?? null,
    backgroundSummary: input.patch.backgroundSummary ?? existing?.backgroundSummary ?? null,
    pacePreference: input.patch.pacePreference ?? existing?.pacePreference ?? null,
    depthPreference: input.patch.depthPreference ?? existing?.depthPreference ?? null,
    examplePreferencesJson: input.patch.examplePreferencesJson ?? existing?.examplePreferencesJson ?? {},
    assessmentPreferenceJson: input.patch.assessmentPreferenceJson ?? existing?.assessmentPreferenceJson ?? {},
    constraintsJson: input.patch.constraintsJson ?? existing?.constraintsJson ?? {},
  };

  if (existing) {
    await dbClient.db
      .update(studentProfiles)
      .set({
        ...nextProfile,
        updatedAt: now,
      })
      .where(eq(studentProfiles.id, existing.id));
  } else {
    await dbClient.db.insert(studentProfiles).values({
      id: profileId,
      notebookId: input.notebookId,
      userId: input.userId,
      ...nextProfile,
      createdAt: now,
      updatedAt: now,
    });
  }

  const profile = (await readStudentProfile(dbClient, input.notebookId, input.userId)) as StudentProfileRecord;
  const event = await appendEvent(dbClient, {
    notebookId: input.notebookId,
    eventType: "student_profile.updated",
    payload: {
      studentProfileId: profile.id,
      notebookId: input.notebookId,
      userId: input.userId,
      updatedFields: Object.keys(input.patch),
      traceId: input.traceId,
      profile: {
        id: profile.id,
        notebookId: profile.notebookId,
        userId: profile.userId,
        goalSummary: profile.goalSummary,
        backgroundSummary: profile.backgroundSummary,
        pacePreference: profile.pacePreference,
        depthPreference: profile.depthPreference,
      },
    },
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });

  return { profile, eventId: event.id };
}