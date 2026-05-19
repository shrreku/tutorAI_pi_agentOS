export * from "./types.js";
export * from "./topic.js";
export { buildProjectionPlan } from "./build-projection-plan.js";
export { applyProjectionPlan } from "./apply-projection-plan.js";
export { loadCanonicalProjectionSnapshot, maxCanonicalUpdatedAt } from "./load-canonical-snapshot.js";
export { clearNotebookProjectionScope, clearSourceProjectionScope } from "./clear-projection-scope.js";
export {
  computeProjectionLagSeconds,
  deriveHealthStatus,
  learnerWarningForHealth,
  loadNotebookProjectionHealth,
  loadSourceProjectionHealth,
  upsertNotebookProjectionHealth,
  upsertSourceProjectionHealth,
} from "./projection-health.js";
export {
  projectGraphFromCanonical,
  rebuildNotebookProjection,
  rebuildSourceProjection,
  type ProjectGraphEnv,
  type ProjectGraphInput,
  type ProjectGraphResult,
} from "./project-graph.js";
