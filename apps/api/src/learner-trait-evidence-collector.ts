import { and, desc, eq } from "drizzle-orm";
import { masteryEvidence, studentProfiles, tutorSessions, tutorTurns, type DbClient } from "@studyagent/db";
import type { LearnerTraitEvidenceRef, LearnerTraitTriggerSummary } from "@studyagent/schemas";
import { buildLearnerTraitEvidencePacket } from "./learner-trait-estimation.js";
import { deriveMasteryEvidencePatternSignals } from "./learner-trait-mastery-patterns.js";
import { readCurrentLearnerTraitEstimates, readRecentLearnerTraitSignals } from "./learner-trait-store.js";

const MASTERY_EVIDENCE_LIMIT = 20;
const SESSION_SUMMARY_LIMIT = 5;

export async function collectLearnerTraitEvidencePacket(
  dbClient: DbClient,
  input: {
    notebookId: string;
    userId: string;
    trigger: LearnerTraitTriggerSummary;
    sessionId?: string;
    now?: () => Date;
  },
) {
  const [signals, currentEstimates, masteryRows, profileRows, sessionSummaries] = await Promise.all([
    readRecentLearnerTraitSignals(dbClient, {
      notebookId: input.notebookId,
      userId: input.userId,
      limit: 50,
    }),
    readCurrentLearnerTraitEstimates(dbClient, {
      notebookId: input.notebookId,
      userId: input.userId,
    }),
    dbClient.db
      .select()
      .from(masteryEvidence)
      .where(and(eq(masteryEvidence.notebookId, input.notebookId), eq(masteryEvidence.userId, input.userId)))
      .orderBy(desc(masteryEvidence.createdAt))
      .limit(MASTERY_EVIDENCE_LIMIT),
    dbClient.db
      .select()
      .from(studentProfiles)
      .where(and(eq(studentProfiles.notebookId, input.notebookId), eq(studentProfiles.userId, input.userId)))
      .limit(1),
    loadRecentSessionSummaries(dbClient, {
      notebookId: input.notebookId,
      userId: input.userId,
      limit: SESSION_SUMMARY_LIMIT,
    }),
  ]);

  const masteryEvidenceSummaries = masteryRows.map((row) => summarizeMasteryEvidenceRow(row));
  const profileSummary = buildProfileSummary(profileRows[0]);
  const contradictionRefs = collectContradictionRefs(currentEstimates, masteryEvidenceSummaries);
  const patternSignals = deriveMasteryEvidencePatternSignals({
    notebookId: input.notebookId,
    userId: input.userId,
    masteryRows,
    ...(input.now ? { now: input.now } : {}),
  });

  return buildLearnerTraitEvidencePacket({
    notebookId: input.notebookId,
    userId: input.userId,
    trigger: input.trigger,
    signals: [...signals, ...patternSignals],
    currentEstimates,
    masteryEvidenceSummaries,
    ...(profileSummary ? { profileSummary } : {}),
    sessionSummaries,
    contradictionRefs,
    ...(input.now ? { now: input.now } : {}),
  });
}

async function loadRecentSessionSummaries(
  dbClient: DbClient,
  input: { notebookId: string; userId: string; limit: number },
): Promise<Array<{ evidenceRef: LearnerTraitEvidenceRef; summary: string }>> {
  const turnRows = await dbClient.db
    .select({
      turnId: tutorTurns.id,
      sessionId: tutorTurns.sessionId,
      userMessage: tutorTurns.userMessage,
      assistantMessage: tutorTurns.assistantMessage,
      createdAt: tutorTurns.createdAt,
    })
    .from(tutorTurns)
    .innerJoin(tutorSessions, eq(tutorTurns.sessionId, tutorSessions.id))
    .where(and(eq(tutorSessions.notebookId, input.notebookId), eq(tutorSessions.userId, input.userId)))
    .orderBy(desc(tutorTurns.createdAt))
    .limit(input.limit * 3);

  const seenSessions = new Set<string>();
  const summaries: Array<{ evidenceRef: LearnerTraitEvidenceRef; summary: string }> = [];

  for (const row of turnRows) {
    if (seenSessions.has(row.sessionId)) continue;
    seenSessions.add(row.sessionId);
    const userSnippet = truncate(row.userMessage ?? "", 180);
    const assistantSnippet = truncate(row.assistantMessage ?? "", 180);
    summaries.push({
      evidenceRef: { refType: "session_trace", refId: row.sessionId },
      summary: `Session ${row.sessionId}: learner "${userSnippet}" tutor "${assistantSnippet}"`,
    });
    if (summaries.length >= input.limit) break;
  }

  return summaries;
}

function summarizeMasteryEvidenceRow(row: {
  id: string;
  turnId: string | null;
  sessionId: string | null;
  evidenceJson: Record<string, unknown>;
}): { evidenceRef: LearnerTraitEvidenceRef; summary: string } {
  const evidence = row.evidenceJson;
  const correctnessLabel = typeof evidence.correctnessLabel === "string" ? evidence.correctnessLabel : "unknown";
  const confidence = typeof evidence.confidence === "number" ? evidence.confidence : null;
  const evidenceType = typeof evidence.evidenceType === "string" ? evidence.evidenceType : "unknown";
  const parts = [
    `Mastery evidence ${row.id}: ${correctnessLabel}`,
    evidenceType !== "unknown" ? `type=${evidenceType}` : null,
    confidence !== null ? `confidence=${confidence.toFixed(2)}` : null,
  ].filter(Boolean);

  if (evidenceType === "self_report" && (correctnessLabel === "partial" || correctnessLabel === "incorrect")) {
    parts.push("possible self-report contradiction");
  }

  return {
    evidenceRef: {
      refType: "mastery_evidence",
      refId: row.id,
      ...(row.turnId ? { summary: `turn ${row.turnId}` } : {}),
    },
    summary: parts.join(", "),
  };
}

function buildProfileSummary(profile?: {
  goalSummary: string | null;
  pacePreference: string | null;
  depthPreference: string | null;
  examplePreferencesJson?: Record<string, unknown> | null;
  assessmentPreferenceJson?: Record<string, unknown> | null;
}): string | undefined {
  if (!profile) return undefined;
  const parts = [
    profile.goalSummary ? `Goal: ${truncate(profile.goalSummary, 200)}` : null,
    profile.pacePreference ? `Profile pace preference: ${profile.pacePreference}` : null,
    profile.depthPreference ? `Profile depth preference: ${profile.depthPreference}` : null,
    formatPreferenceJson("Example preference", profile.examplePreferencesJson),
    formatPreferenceJson("Assessment preference", profile.assessmentPreferenceJson),
  ].filter(Boolean);
  return parts.length ? parts.join(". ") : undefined;
}

function formatPreferenceJson(label: string, value: Record<string, unknown> | null | undefined): string | null {
  if (!value || Object.keys(value).length === 0) return null;
  const preference = typeof value.preference === "string" ? value.preference : null;
  if (preference) return `${label}: ${preference}`;
  const serialized = Object.entries(value)
    .map(([key, entry]) => `${key}=${String(entry)}`)
    .join(", ");
  return serialized ? `${label}: ${serialized}` : null;
}

function collectContradictionRefs(
  estimates: Awaited<ReturnType<typeof readCurrentLearnerTraitEstimates>>,
  masterySummaries: Array<{ evidenceRef: LearnerTraitEvidenceRef; summary: string }>,
): LearnerTraitEvidenceRef[] {
  const refs = estimates.flatMap((estimate) => estimate.contradictionRefs ?? []);
  const masteryContradictions = masterySummaries
    .filter((entry) => entry.summary.includes("self-report contradiction"))
    .map((entry) => entry.evidenceRef);
  const seen = new Set<string>();
  return [...refs, ...masteryContradictions].filter((ref) => {
    const key = `${ref.refType}:${ref.refId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
