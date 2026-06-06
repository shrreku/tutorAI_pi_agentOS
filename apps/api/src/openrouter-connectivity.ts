import type { StudyAgentEnv } from "@studyagent/config";

export type OpenRouterConnectivityStatus = {
  reachable: boolean;
  latencyMs?: number;
  error?: string;
};

export async function probeOpenRouterConnectivity(
  env: StudyAgentEnv,
  timeoutMs = 5000,
): Promise<OpenRouterConnectivityStatus> {
  if (!env.OPENROUTER_API_KEY) {
    return { reachable: false, error: "OPENROUTER_API_KEY is not set" };
  }

  const base = (env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${base}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      return {
        reachable: false,
        latencyMs: Date.now() - started,
        error: body?.error?.message ?? `OpenRouter models probe failed (${response.status})`,
      };
    }
    return { reachable: true, latencyMs: Date.now() - started };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      reachable: false,
      latencyMs: Date.now() - started,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function formatOpenRouterConnectivityWarning(status: OpenRouterConnectivityStatus): string {
  const viaHostProxy =
    "Start the host proxy in another terminal: pnpm dev:openrouter-proxy. " +
    "Docker Compose routes OPENROUTER_BASE_URL through http://host.docker.internal:8787/api/v1.";
  const base = status.error
    ? `OpenRouter is unreachable from this API process (${status.error}). Tutor turns will fall back to lexical retrieval and the local mock tutor.`
    : "OpenRouter is unreachable from this API process. Tutor turns will fall back to lexical retrieval and the local mock tutor.";
  return `${base} ${viaHostProxy}`;
}
