import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../app/navigation.js";
import { ContactPage } from "../pages/public/ContactPage.js";

export const Route = createFileRoute("/contact")({
  component: ContactRoute,
});

function ContactRoute() {
  const navigate = useAppNavigate();
  return <ContactPage navigate={navigate} />;
}
