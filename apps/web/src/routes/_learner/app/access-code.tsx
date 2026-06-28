import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_learner/app/access-code")({
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/app/account/$tab",
      params: { tab: "access-code" },
      search,
      replace: true,
    });
  },
});
