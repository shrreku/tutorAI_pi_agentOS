import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../../app/navigation.js";
import EvalRunsDashboard from "../../EvalRunsDashboard.js";

export const Route = createFileRoute("/eval-runs/")({
  component: EvalRunsIndexRoute,
});

function EvalRunsIndexRoute() {
  const navigate = useAppNavigate();
  return (
    <EvalRunsDashboard
      selectedRunId={null}
      onSelectRun={(runId) => void navigate(`/eval-runs/${encodeURIComponent(runId)}`)}
      onBackToNotebooks={() => void navigate("/notebooks")}
    />
  );
}
