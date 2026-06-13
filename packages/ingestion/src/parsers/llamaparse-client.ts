import { Buffer } from "node:buffer";
import { startObservation } from "@studyagent/observability";

export type LlamaParseTier = "fast" | "cost_effective" | "agentic" | "agentic_plus";

export type LlamaParseClientOptions = {
  apiKey: string;
  /** e.g. `https://api.cloud.llamaindex.ai` */
  baseUrl: string;
  tier: LlamaParseTier;
  /** Parse API tier version pin */
  version?: string;
  pollMs?: number;
  maxWaitMs?: number;
  requestAttempts?: number;
  requestRetryBaseMs?: number;
};

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientStatus(status: number): boolean {
  return [408, 409, 425, 429, 499, 500, 502, 503, 504].includes(status);
}

function retryAfterMs(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(raw);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

function retryDelayMs(input: { attempt: number; baseMs: number; headers?: Headers }): number {
  const fromHeader = input.headers ? retryAfterMs(input.headers) : null;
  if (fromHeader != null) return Math.min(fromHeader, 30_000);
  return Math.min(30_000, input.baseMs * 2 ** Math.max(0, input.attempt - 1));
}

function bodySnippet(body: unknown, maxChars: number): string {
  return JSON.stringify(body).slice(0, maxChars);
}

async function readResponseJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { body: text.slice(0, 1000) };
  }
}

async function fetchJsonWithRetry(input: {
  operation: string;
  maxAttempts: number;
  retryBaseMs: number;
  snippetChars: number;
  makeRequest: () => Promise<Response>;
}): Promise<unknown> {
  const attempts = Math.max(1, input.maxAttempts);
  let lastFailure: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await input.makeRequest();
      const json = await readResponseJson(response);
      if (response.ok) return json;

      lastFailure = new Error(
        `LlamaCloud ${input.operation} failed${attempts > 1 ? ` after ${attempt} attempt${attempt === 1 ? "" : "s"}` : ""} (${response.status}): ${bodySnippet(json, input.snippetChars)}`,
      );
      if (attempt < attempts && isTransientStatus(response.status)) {
        await sleep(
          retryDelayMs({ attempt, baseMs: input.retryBaseMs, headers: response.headers }),
        );
        continue;
      }
      throw lastFailure;
    } catch (error) {
      if (
        attempt < attempts &&
        (error instanceof TypeError || (error instanceof Error && error.name === "AbortError"))
      ) {
        lastFailure = error;
        await sleep(retryDelayMs({ attempt, baseMs: input.retryBaseMs }));
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `LlamaCloud ${input.operation} request failed after ${attempts} attempts: ${
      lastFailure instanceof Error ? lastFailure.message : String(lastFailure)
    }`,
  );
}

function extractJobId(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const job = o.job;
  if (job && typeof job === "object") {
    const jid = (job as Record<string, unknown>).id;
    if (typeof jid === "string") return jid;
  }
  if (typeof o.id === "string") return o.id;
  return null;
}

function extractJobStatus(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (typeof o.status === "string") return o.status;
  const job = o.job;
  if (job && typeof job === "object") {
    const st = (job as Record<string, unknown>).status;
    if (typeof st === "string") return st;
  }
  return null;
}

function extractMarkdownFull(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const direct = o.markdown_full;
  if (typeof direct === "string" && direct.length) return direct;
  const job = o.job;
  if (job && typeof job === "object") {
    const m = (job as Record<string, unknown>).markdown_full;
    if (typeof m === "string" && m.length) return m;
  }
  const result = o.result;
  if (result && typeof result === "object") {
    const m2 = (result as Record<string, unknown>).markdown_full;
    if (typeof m2 === "string" && m2.length) return m2;
  }
  return null;
}

function extractErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const em = o.error_message ?? o.errorMessage;
  if (typeof em === "string") return em;
  const job = o.job;
  if (job && typeof job === "object") {
    const jm = (job as Record<string, unknown>).error_message;
    if (typeof jm === "string") return jm;
  }
  return null;
}

/**
 * Upload bytes to LlamaCloud files API, enqueue v2 parse job, poll until markdown is ready.
 */
export async function llamaParsePdfToMarkdown(
  bytes: Uint8Array,
  filename: string,
  opts: LlamaParseClientOptions,
): Promise<{ markdown: string; jobId: string; warnings: string[] }> {
  const base = trimSlash(opts.baseUrl);
  const warnings: string[] = [];
  const version = opts.version ?? "latest";
  const pollMs = opts.pollMs ?? 2500;
  const maxWaitMs = opts.maxWaitMs ?? 600_000;
  const requestAttempts = opts.requestAttempts ?? 3;
  const requestRetryBaseMs = opts.requestRetryBaseMs ?? 1000;
  const auth = { Authorization: `Bearer ${opts.apiKey}` } as const;
  const observation = startObservation(
    "llamaparse.pdf",
    {
      input: {
        filename,
        byteLength: bytes.length,
        tier: opts.tier,
        version,
      },
      metadata: { baseUrl: base, pollMs, maxWaitMs },
    },
    { asType: "tool" },
  );

  try {
    const bodyBuf = Buffer.from(bytes);
    const upJson = await fetchJsonWithRetry({
      operation: "file upload",
      maxAttempts: requestAttempts,
      retryBaseMs: requestRetryBaseMs,
      snippetChars: 500,
      makeRequest: () => {
        const uploadFd = new FormData();
        uploadFd.append(
          "file",
          new Blob([bodyBuf], { type: "application/pdf" }),
          filename || "document.pdf",
        );
        uploadFd.append("purpose", "parse");
        return fetch(`${base}/api/v1/beta/files`, {
          method: "POST",
          headers: auth,
          body: uploadFd,
        });
      },
    });

    const fileId =
      typeof (upJson as { id?: unknown }).id === "string"
        ? (upJson as { id: string }).id
        : typeof (upJson as { file_id?: unknown }).file_id === "string"
          ? (upJson as { file_id: string }).file_id
          : null;
    if (!fileId) {
      throw new Error(
        `LlamaCloud file upload: missing file id in response: ${JSON.stringify(upJson).slice(0, 400)}`,
      );
    }

    const parseJson = await fetchJsonWithRetry({
      operation: "parse job create",
      maxAttempts: requestAttempts,
      retryBaseMs: requestRetryBaseMs,
      snippetChars: 600,
      makeRequest: () =>
        fetch(`${base}/api/v2/parse`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({
            file_id: fileId,
            tier: opts.tier,
            version,
            client_name: "studyagent-ingestion",
          }),
        }),
    });

    const jobId = extractJobId(parseJson);
    if (!jobId) {
      throw new Error(
        `LlamaCloud parse: missing job id: ${JSON.stringify(parseJson).slice(0, 400)}`,
      );
    }

    const started = Date.now();
    while (Date.now() - started < maxWaitMs) {
      const stJson = await fetchJsonWithRetry({
        operation: "parse poll",
        maxAttempts: requestAttempts,
        retryBaseMs: requestRetryBaseMs,
        snippetChars: 400,
        makeRequest: () =>
          fetch(
            `${base}/api/v2/parse/${encodeURIComponent(jobId)}?expand=markdown_full,job_metadata`,
            {
              headers: auth,
            },
          ),
      });

      const status = (extractJobStatus(stJson) ?? "").toUpperCase();
      const md = extractMarkdownFull(stJson);
      const done = ["COMPLETED", "SUCCEEDED", "SUCCESS", "COMPLETE"].includes(status);

      if (done && md) {
        observation.update({
          output: { jobId, markdownLength: md.length, warnings: warnings.length },
          metadata: { status, baseUrl: base },
        });
        observation.end();
        return { markdown: md, jobId, warnings };
      }
      if (done && !md) {
        throw new Error(
          `LlamaParse job ${jobId} finished with status ${status} but markdown_full is empty`,
        );
      }

      if (status === "FAILED" || status === "CANCELLED") {
        const err = extractErrorMessage(stJson) ?? status;
        throw new Error(`LlamaParse job ${jobId} ${status}: ${err}`);
      }

      await sleep(pollMs);
    }

    throw new Error(`LlamaParse job ${jobId} timed out after ${maxWaitMs}ms`);
  } catch (error) {
    observation.update({
      level: "ERROR",
      statusMessage: error instanceof Error ? error.message : "LlamaParse failed",
      output: { error: error instanceof Error ? error.message : String(error) },
      metadata: { baseUrl: base, status: "failed" },
    });
    observation.end();
    throw error;
  }
}
