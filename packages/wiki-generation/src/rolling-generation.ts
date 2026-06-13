export { resetGenerationTargetCacheForTests, markGenerationTargetComplete, isTargetAlreadyComplete } from "./generation-target-registry.js";
export { gatherRollingLearnerSignals, conceptIdsFromMasteryEvidence } from "./learner-signal-reader.js";
export {
  loadModulePage,
  loadTopicPagesForConcepts,
  loadConceptPages,
  selectCoreConceptIdsForFirstObjective,
  isPolishFailure,
  runPolishJobTracked,
  syncStudyPlanForModule,
  upsertActiveSessionPlan,
  lightlyRefreshFollowingModuleOutline,
  planModuleObjectivesWithLlm,
  deterministicObjectiveTitles,
  ensureModuleObjectives,
  runPagePolishJob,
  type PagePolishJobTarget,
} from "./rolling-generation-shared.js";
export { runInitialBuild, type InitialBuildInput } from "./initial-build.js";
export { runRollingModuleBuild, type RollingModuleBuildInput } from "./rolling-module-build.js";
