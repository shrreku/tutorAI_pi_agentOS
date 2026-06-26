export type OpenRouterJsonMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenRouterJsonClientConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  timeoutMs?: number;
  label: string;
};

export async function fetchOpenRouterJsonCompletion(
  config: OpenRouterJsonClientConfig,
  messages: OpenRouterJsonMessage[],
): Promise<unknown> {
  const base = config.baseUrl.replace(/\/+$/, "");
  const timeoutMs = config.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature ?? 0.1,
        response_format: { type: "json_object" },
        messages,
      }),
    });
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(
        `${config.label} failed (${response.status}): ${body.error?.message ?? "unknown_error"}`,
      );
    }

    const text = body.choices?.[0]?.message?.content;
    if (!text) throw new Error(`${config.label} returned empty content.`);
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${config.label} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
