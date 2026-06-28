import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_learner/app/credits")({
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/app/account/$tab",
      params: { tab: "credits" },
      search,
      replace: true,
    });
  },
});
