import { resolveOpenRouterEmbeddingModelId } from "./embedding-model.js";
import { startObservation } from "@studyagent/observability";

export type OpenRouterEmbedClientOptions = {
  /** Base URL without trailing slash, e.g. `https://openrouter.ai/api/v1` */
  baseUrl: string;
  apiKey: string;
  /** Configured model name or full OpenRouter id */
  model: string;
  dimensions?: number;
  /** Max strings per HTTP request (OpenRouter/OpenAI batch limit) */
  batchSize?: number;
};

export type EmbedTextsResult = {
  embeddings: number[][];
  model: string;
  usage?: unknown;
};

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

type OpenAIEmbeddingsResponse = {
  data?: Array<{ embedding?: number[]; index?: number }>;
  model?: string;
  usage?: unknown;
  error?: { message?: string };
};

/**
 * OpenAI-compatible `POST /embeddings` against OpenRouter (or any compatible host).
 */
export async function embedTextsOpenRouter(
  texts: string[],
  opts: OpenRouterEmbedClientOptions,
): Promise<EmbedTextsResult> {
  const base = trimSlash(opts.baseUrl);
  const model = resolveOpenRouterEmbeddingModelId(opts.model);
  const batchSize = opts.batchSize ?? 32;
  const all: number[][] = [];
  let lastUsage: unknown;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const observation = startObservation(
      "openrouter.embeddings",
      {
        input: {
          textCount: batch.length,
          model,
          dimensions: opts.dimensions,
          preview: batch.slice(0, 2).map((text) => text.slice(0, 200)),
        },
        metadata: {
          baseUrl: base,
          batchIndex: i / batchSize,
          batchSize,
        },
      },
      { asType: "embedding" },
    );

    const body: Record<string, unknown> = {
      model,
      input: batch,
    };
    if (opts.dimensions != null) {
      body.dimensions = opts.dimensions;
    }

    try {
      const res = await fetch(`${base}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "HTTP-Referer": "https://github.com/studyagent/studyagent",
          "X-Title": "StudyAgent Ingestion",
        },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as OpenAIEmbeddingsResponse;
      if (!res.ok) {
        const msg = json?.error?.message ?? res.statusText;
        throw new Error(`OpenRouter embeddings failed (${res.status}): ${msg}`);
      }

      const rows = json.data ?? [];
      const sorted = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      if (sorted.length !== batch.length) {
        throw new Error(`OpenRouter embeddings: expected ${batch.length} vectors, got ${sorted.length}`);
      }
      for (const row of sorted) {
        const emb = row.embedding;
        if (!Array.isArray(emb)) {
          throw new Error("OpenRouter embeddings response missing embedding array");
        }
        if (opts.dimensions != null && emb.length !== opts.dimensions) {
          throw new Error(
            `Embedding dimension mismatch: expected ${opts.dimensions}, got ${emb.length} (model ${model})`,
          );
        }
        all.push(emb);
      }
      lastUsage = json.usage ?? lastUsage;
      observation.update({
        output: { vectorCount: sorted.length, model, usage: json.usage },
        metadata: { batchIndex: i / batchSize, batchSize, status: "completed" },
      });
    } catch (error) {
      observation.update({
        level: "ERROR",
        statusMessage: error instanceof Error ? error.message : "OpenRouter embeddings failed",
        output: { error: error instanceof Error ? error.message : String(error) },
        metadata: { batchIndex: i / batchSize, batchSize, status: "failed" },
      });
      observation.end();
      throw error;
    }

    observation.end();
  }

  return { embeddings: all, model, usage: lastUsage };
}
