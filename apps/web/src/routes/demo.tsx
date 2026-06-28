import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/demo")({
  beforeLoad: () => {
    throw redirect({ to: "/landing/$variant", params: { variant: "tutor" }, replace: true });
  },
});
