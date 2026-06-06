import { buildReducerResult, type RuntimeWriteToolProvider } from "@studyagent/tools";
import type { AppContext } from "./context.js";
import { upsertStudentProfile } from "./student-profile.js";
import { createArtifactWriteHandlers } from "./tutor-write-artifacts.js";
import { createClaimWriteHandlers } from "./tutor-write-claims.js";
import { createCoverageWriteHandlers } from "./tutor-write-coverage.js";
import { createCurriculumWriteHandlers } from "./tutor-write-curriculum.js";
import { createLearnerTraitWriteHandlers } from "./tutor-write-learner-traits.js";
import { createMasteryWriteHandlers } from "./tutor-write-mastery.js";

export { findCoverageRecordForScope, selectPreferredCoverageGapRow } from "./tutor-write-coverage.js";
export { sanitizeArtifactSourceNodeRefs } from "./tutor-write-artifacts.js";

export function createTutorWriteToolProvider(appCtx: AppContext): RuntimeWriteToolProvider {
  return {
    ...createClaimWriteHandlers(appCtx),
    ...createArtifactWriteHandlers(appCtx),
    ...createCoverageWriteHandlers(appCtx),
    ...createCurriculumWriteHandlers(appCtx),
    ...createLearnerTraitWriteHandlers(appCtx),
    ...createMasteryWriteHandlers(appCtx),

    async updateStudentProfilePreferences(input, ctx) {
      const result = await upsertStudentProfile(appCtx.db, {
        notebookId: ctx.notebookId,
        userId: input.userId ?? ctx.userId,
        patch: input,
        ...(ctx.runId ? { runId: ctx.runId } : {}),
        ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
        traceId: ctx.traceId,
      });

      return {
        studentProfile: {
          id: result.profile.id,
          notebookId: result.profile.notebookId,
          userId: result.profile.userId,
          goalSummary: result.profile.goalSummary,
          backgroundSummary: result.profile.backgroundSummary,
          pacePreference: result.profile.pacePreference,
          depthPreference: result.profile.depthPreference,
          examplePreferencesJson: result.profile.examplePreferencesJson,
          assessmentPreferenceJson: result.profile.assessmentPreferenceJson,
          constraintsJson: result.profile.constraintsJson,
          createdAt: result.profile.createdAt.toISOString(),
          updatedAt: result.profile.updatedAt.toISOString(),
        },
        warnings: [],
        reducerResult: buildReducerResult(
          "student_profile.updated",
          {
            studentProfileId: result.profile.id,
            notebookId: ctx.notebookId,
            userId: input.userId ?? ctx.userId,
            goalSummary: input.goalSummary ?? null,
            backgroundSummary: input.backgroundSummary ?? null,
            pacePreference: input.pacePreference ?? null,
            depthPreference: input.depthPreference ?? null,
            examplePreferencesJson: input.examplePreferencesJson ?? {},
            assessmentPreferenceJson: input.assessmentPreferenceJson ?? {},
            constraintsJson: input.constraintsJson ?? {},
          },
          [result.eventId],
        ),
      };
    },
  };
}
