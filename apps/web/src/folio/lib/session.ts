import { useQuery } from "@tanstack/react-query";
import { sessionQueryOptions } from "@studyagent/api-client";
import type { MeResponse } from "@studyagent/schemas";
import { apiClient } from "../../platform/api-client.js";

/** Live session (cookie-backed). Cached by react-query; refetched on focus. */
export function useSession() {
  return useQuery(sessionQueryOptions(apiClient.request));
}

export function displayNameOf(session: MeResponse | null | undefined): string {
  return session?.user?.displayName ?? session?.user?.email ?? "Reader";
}

export function firstNameOf(session: MeResponse | null | undefined): string {
  const name = displayNameOf(session);
  return name.split(/[\s@]/u)[0] || "Reader";
}

export function creditsPercentOf(session: MeResponse | null | undefined): number | null {
  const pct = session?.credits?.percentRemaining;
  return typeof pct === "number" ? Math.max(0, Math.min(100, Math.round(pct))) : null;
}
