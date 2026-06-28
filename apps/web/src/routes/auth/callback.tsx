import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../../app/navigation.js";
import { AuthCallbackPage } from "../../pages/public/AuthCallbackPage.js";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackRoute,
});

function AuthCallbackRoute() {
  const navigate = useAppNavigate();
  return <AuthCallbackPage navigate={navigate} />;
}
