import type {
  InteractiveLearningActionEnvelope,
  InteractiveLearningActionName,
  InteractiveLearningActionResponse,
  InteractiveLearningBlock,
} from "@studyagent/schemas";
import type { AppContext } from "../context.js";

export type InteractiveLearningActionError = {
  code: "bad_request" | "not_found" | "forbidden";
  message: string;
};

export type ActionHandlerResult = {
  updatedConceptStates?: InteractiveLearningActionResponse["updatedConceptStates"];
  attemptId?: string;
};

export type ActionContext = {
  ctx: AppContext;
  notebookId: string;
  userId: string;
  envelope: InteractiveLearningActionEnvelope;
  block: InteractiveLearningBlock;
  payload: unknown;
  nodeId: string;
  artifactId: string | undefined;
};

export type ActionHandlerOutcome =
  | { ok: true; data: ActionHandlerResult }
  | { ok: false; error: InteractiveLearningActionError };

export type ActionHandler = (actionCtx: ActionContext) => Promise<ActionHandlerOutcome>;

export type ActionHandlersRegistry = Record<InteractiveLearningActionName, ActionHandler>;
