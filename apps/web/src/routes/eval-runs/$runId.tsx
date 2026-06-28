import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../../app/navigation.js";
import EvalRunsDashboard from "../../EvalRunsDashboard.js";

export const Route = createFileRoute("/eval-runs/$runId")({
  component: EvalRunDetailRoute,
});

function EvalRunDetailRoute() {
  const navigate = useAppNavigate();
  const { runId } = Route.useParams();
  return (
    <EvalRunsDashboard
      selectedRunId={runId}
      onSelectRun={(id) => void navigate(`/eval-runs/${encodeURIComponent(id)}`)}
      onBackToNotebooks={() => void navigate("/notebooks")}
    />
  );
}
