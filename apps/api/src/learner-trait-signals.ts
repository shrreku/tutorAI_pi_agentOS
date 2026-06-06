import type { AppContext } from "./context.js";
import type { LearnerTraitKey } from "@studyagent/schemas";
import { readLearnerTraitSignalsForTurn, recordLearnerTraitSignal } from "./learner-trait-store.js";

const GOVERNED_EXPLICIT_SOURCES = new Set(["explicit_self_report", "tutor_recorded_preference", "onboarding_profile"]);

export type ExplicitTraitSignalCandidate = {
  trait: LearnerTraitKey;
  value: string;
  notes: string;
};

export type ReflectiveTraitSignalCandidate = {
  trait: LearnerTraitKey;
  value: string;
  notes: string;
};

export function extractExplicitPreferenceSignals(message: string): ExplicitTraitSignalCandidate[] {
  const text = message.toLowerCase();
  const candidates: ExplicitTraitSignalCandidate[] = [];

  if (/\b(go\s+)?slower\b|\bslow\s+(down|pace)\b|\bno rush\b/.test(text)) {
    candidates.push({ trait: "pacePreference", value: "slow", notes: "Learner explicitly requested a slower pace." });
  } else if (/\bfaster\b|\bquickly\b|\bspeed up\b|\bbrief\b|\bconcise\b/.test(text)) {
    candidates.push({ trait: "pacePreference", value: "fast", notes: "Learner explicitly requested a faster or more concise pace." });
  }
  if (/\bvisual\b|\bdiagram\b|\bgraph\b/.test(text)) {
    candidates.push({ trait: "examplePreference", value: "visual", notes: "Learner explicitly requested visual examples." });
  }
  if (/\bconcrete example\b|\breal[- ]world example\b|\bworked example\b|\bexample preference\b/.test(text)) {
    candidates.push({ trait: "examplePreference", value: "concrete", notes: "Learner explicitly requested concrete examples." });
  }
  if (/\bquiz\b|\btest me\b|\bpractice questions?\b/.test(text)) {
    candidates.push({ trait: "assessmentPreference", value: "quiz", notes: "Learner explicitly requested quiz-style practice." });
  }
  if (/\bworked problem\b|\bworked example\b|\bstep[- ]by[- ]step problem\b/.test(text)) {
    candidates.push({ trait: "assessmentPreference", value: "worked_problem", notes: "Learner explicitly requested worked-problem practice." });
  }
  if (/\bexam\b|\btest tomorrow\b|\bdeadline\b|\btomorrow\b/.test(text)) {
    candidates.push({ trait: "urgencyContext", value: "exam_prep", notes: "Learner explicitly described exam or deadline urgency." });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.trait)) return false;
    seen.add(candidate.trait);
    return true;
  });
}

export function extractReflectiveBehaviorSignals(input: {
  userMessage: string;
  assistantMessage?: string;
}): ReflectiveTraitSignalCandidate[] {
  const text = input.userMessage.toLowerCase().trim();
  if (!text) return [];

  if (isOneOffExampleRequest(text)) return [];

  const candidates: ReflectiveTraitSignalCandidate[] = [];

  if (/\b(i'?m stuck|don'?t understand|confused|no idea|lost here)\b/.test(text)) {
    candidates.push({
      trait: "helpSeekingStyle",
      value: "asks_early",
      notes: "Reflective extraction: learner expressed confusion or being stuck after a completed turn.",
    });
  } else if (/\b(let me try|i'?ll try|give me a sec|on my own first)\b/.test(text)) {
    candidates.push({
      trait: "helpSeekingStyle",
      value: "tries_first",
      notes: "Reflective extraction: learner indicated they want to attempt the problem first.",
    });
  } else if (/\b(i'?m ready|got this|easy|too easy)\b/.test(text) && /\b(correct|right|yes)\b/.test(text)) {
    candidates.push({
      trait: "confidenceStyle",
      value: "overconfident",
      notes: "Reflective extraction: learner expressed high readiness alongside a short confirmation.",
    });
  } else if (/\b(not sure|probably wrong|might be wrong|low confidence)\b/.test(text)) {
    candidates.push({
      trait: "confidenceStyle",
      value: "underconfident",
      notes: "Reflective extraction: learner expressed uncertainty in their completed-turn message.",
    });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.trait)) return false;
    seen.add(candidate.trait);
    return true;
  });
}

function isOneOffExampleRequest(text: string): boolean {
  return /^(can you )?(give|show) me an example\b/.test(text) || /^example\??$/.test(text);
}

export async function recordExplicitPreferenceSignalsFromMessage(
  ctx: AppContext,
  input: { notebookId: string; userId: string; sessionId: string; turnId: string; runId: string; message: string },
): Promise<number> {
  const message = input.message.trim();
  if (!message) return 0;

  const existingForTurn = await readLearnerTraitSignalsForTurn(ctx.db, { turnId: input.turnId });
  const governedTraits = new Set(
    existingForTurn
      .filter((signal) => GOVERNED_EXPLICIT_SOURCES.has(signal.source))
      .map((signal) => signal.trait),
  );

  let recorded = 0;
  for (const candidate of extractExplicitPreferenceSignals(message)) {
    if (governedTraits.has(candidate.trait)) continue;
    await recordLearnerTraitSignal(ctx.db, {
      id: `lts_${crypto.randomUUID().replaceAll("-", "")}`,
      notebookId: input.notebookId,
      userId: input.userId,
      source: "explicit_self_report",
      trait: candidate.trait,
      suggestedValue: candidate.value,
      strength: 0.95,
      confidence: 0.9,
      evidenceRefs: [
        {
          refType: "self_report",
          refId: input.turnId,
          summary: truncateUtterance(input.message),
        },
        {
          refType: "session_trace",
          refId: input.sessionId,
          summary: `Explicit learner self-report after tutor turn ${input.turnId} in run ${input.runId}.`,
        },
      ],
      sessionId: input.sessionId,
      turnId: input.turnId,
      runId: input.runId,
      internalVisibility: true,
      observedAt: new Date().toISOString(),
      notes: candidate.notes,
    } as Parameters<typeof recordLearnerTraitSignal>[1]);
    recorded += 1;
  }
  return recorded;
}

export async function recordReflectiveBehaviorSignalsFromTurn(
  ctx: AppContext,
  input: {
    notebookId: string;
    userId: string;
    sessionId: string;
    turnId: string;
    runId: string;
    userMessage: string;
    assistantMessage?: string;
  },
): Promise<number> {
  let recorded = 0;
  const existingForTurn = await readLearnerTraitSignalsForTurn(ctx.db, { turnId: input.turnId });
  const inferredTraits = new Set(
    existingForTurn
      .filter((signal) => signal.source === "behavior_extraction")
      .map((signal) => signal.trait),
  );

  for (const candidate of extractReflectiveBehaviorSignals({
    userMessage: input.userMessage,
    ...(input.assistantMessage ? { assistantMessage: input.assistantMessage } : {}),
  })) {
    if (inferredTraits.has(candidate.trait)) continue;
    await recordLearnerTraitSignal(ctx.db, {
      id: `lts_${crypto.randomUUID().replaceAll("-", "")}`,
      notebookId: input.notebookId,
      userId: input.userId,
      source: "behavior_extraction",
      trait: candidate.trait,
      suggestedValue: candidate.value,
      strength: 0.55,
      confidence: 0.5,
      evidenceRefs: [
        {
          refType: "behavior_observation",
          refId: input.turnId,
          summary: truncateUtterance(input.userMessage),
        },
        {
          refType: "session_trace",
          refId: input.sessionId,
          summary: `Reflective behavior extraction after tutor turn ${input.turnId} in run ${input.runId}.`,
        },
      ],
      sessionId: input.sessionId,
      turnId: input.turnId,
      runId: input.runId,
      internalVisibility: true,
      observedAt: new Date().toISOString(),
      notes: candidate.notes,
    } as Parameters<typeof recordLearnerTraitSignal>[1]);
    recorded += 1;
  }
  return recorded;
}

export async function processCompletedTutorTurnLearnerTraitSignals(
  ctx: AppContext,
  input: {
    notebookId: string;
    userId: string;
    sessionId: string;
    turnId: string;
    runId: string;
    userMessage: string;
    assistantMessage: string;
  },
): Promise<{ explicitCount: number; inferredCount: number }> {
  if (!input.userMessage.trim() || !input.assistantMessage.trim()) {
    return { explicitCount: 0, inferredCount: 0 };
  }

  const explicitCount = await recordExplicitPreferenceSignalsFromMessage(ctx, {
    notebookId: input.notebookId,
    userId: input.userId,
    sessionId: input.sessionId,
    turnId: input.turnId,
    runId: input.runId,
    message: input.userMessage,
  });
  const inferredCount = await recordReflectiveBehaviorSignalsFromTurn(ctx, input);
  return { explicitCount, inferredCount };
}

function truncateUtterance(value: string, maxLength = 240): string {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 3)}...` : trimmed;
}
