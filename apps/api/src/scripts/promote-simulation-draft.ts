import { readFileSync } from "node:fs";
import {
  evaluateSimulationDraftForPromotion,
  validateSimulationDraft,
} from "../simulation-draft-pipeline.js";

const draftPath = process.argv[2];
if (!draftPath) {
  console.error("Usage: pnpm simulation:promote-draft <path-to-draft.json>");
  process.exit(1);
}

const draft = validateSimulationDraft(JSON.parse(readFileSync(draftPath, "utf8")));
const result = evaluateSimulationDraftForPromotion(draft);

console.log(
  JSON.stringify(
    {
      passed: result.passed,
      failures: result.failures,
      evaluationStatus: result.draft.evaluationStatus,
      promotedTemplate: result.promotedTemplate ?? null,
    },
    null,
    2,
  ),
);

process.exit(result.passed ? 0 : 1);
