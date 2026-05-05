/**
 * Map configured embedding names to OpenRouter model IDs.
 * @see https://openrouter.ai/models?q=embedding
 */
export function resolveOpenRouterEmbeddingModelId(configured: string): string {
  const m = configured.trim();
  if (m.includes("/")) return m;

  const aliases: Record<string, string> = {
    "gemini-embedding-2": "google/gemini-embedding-2-preview",
    "gemini-embedding-2-preview": "google/gemini-embedding-2-preview",
    "gemini-embedding-001": "google/gemini-embedding-001",
    "gemini-embedding-1": "google/gemini-embedding-001",
  };

  return aliases[m] ?? m;
}
