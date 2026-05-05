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
};

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
    const uploadFd = new FormData();
    const bodyBuf = Buffer.from(bytes);
    uploadFd.append("file", new Blob([bodyBuf], { type: "application/pdf" }), filename || "document.pdf");
    uploadFd.append("purpose", "parse");

    const upRes = await fetch(`${base}/api/v1/beta/files`, {
      method: "POST",
      headers: auth,
      body: uploadFd,
    });
    const upJson: unknown = await upRes.json().catch(() => ({}));
    if (!upRes.ok) {
      throw new Error(
        `LlamaCloud file upload failed (${upRes.status}): ${JSON.stringify(upJson).slice(0, 500)}`,
      );
    }

    const fileId =
      typeof (upJson as { id?: unknown }).id === "string"
        ? (upJson as { id: string }).id
        : typeof (upJson as { file_id?: unknown }).file_id === "string"
          ? (upJson as { file_id: string }).file_id
          : null;
    if (!fileId) {
      throw new Error(`LlamaCloud file upload: missing file id in response: ${JSON.stringify(upJson).slice(0, 400)}`);
    }

    const parseRes = await fetch(`${base}/api/v2/parse`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        file_id: fileId,
        tier: opts.tier,
        version,
        client_name: "studyagent-ingestion",
      }),
    });
    const parseJson: unknown = await parseRes.json().catch(() => ({}));
    if (!parseRes.ok) {
      throw new Error(
        `LlamaCloud parse job create failed (${parseRes.status}): ${JSON.stringify(parseJson).slice(0, 600)}`,
      );
    }

    const jobId = extractJobId(parseJson);
    if (!jobId) {
      throw new Error(`LlamaCloud parse: missing job id: ${JSON.stringify(parseJson).slice(0, 400)}`);
    }

    const started = Date.now();
    while (Date.now() - started < maxWaitMs) {
      const stRes = await fetch(`${base}/api/v2/parse/${encodeURIComponent(jobId)}?expand=markdown_full,job_metadata`, {
        headers: auth,
      });
      const stJson: unknown = await stRes.json().catch(() => ({}));
      if (!stRes.ok) {
        throw new Error(`LlamaCloud parse poll failed (${stRes.status}): ${JSON.stringify(stJson).slice(0, 400)}`);
      }

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
        throw new Error(`LlamaParse job ${jobId} finished with status ${status} but markdown_full is empty`);
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
