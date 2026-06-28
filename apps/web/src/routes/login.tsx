import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../app/navigation.js";
import { LoginPage } from "../pages/public/LoginPage.js";

export const Route = createFileRoute("/login")({
  component: LoginRoute,
});

function LoginRoute() {
  const navigate = useAppNavigate();
  return <LoginPage navigate={navigate} />;
}
