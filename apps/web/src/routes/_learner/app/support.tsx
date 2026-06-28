import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_learner/app/support")({
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/app/account/$tab",
      params: { tab: "support" },
      search,
      replace: true,
    });
  },
});
