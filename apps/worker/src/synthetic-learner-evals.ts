import { pathToFileURL } from "node:url";
import {
  loadTracerBulletSyntheticLearnerEvalMatrix,
  nodeRefSchema,
  runSyntheticLearnerEvalSuite,
  type NodeRef,
  type SyntheticLearnerEvalRunnerApi,
  type SyntheticLearnerEvalStreamEvent,
} from "@studyagent/schemas";

const isMain = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);

function createHttpSyntheticLearnerEvalApi(baseUrl: string, cookie?: string): SyntheticLearnerEvalRunnerApi {
  const headers = {
    ...(cookie ? { cookie } : {}),
    "content-type": "application/json",
  } as Record<string, string>;

  return {
    async seedNotebook({ fixture, persona, scenario }) {
      const response = await fetch(`${baseUrl}/api/v1/eval/source-fixtures/${encodeURIComponent(fixture.id)}/notebooks`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: `Synthetic learner: ${persona.name} / ${scenario.name}`,
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to seed eval notebook (${response.status}): ${await response.text()}`);
      }
      const payload = (await response.json()) as { notebook: { id: string }; traceRefs?: Array<{ refType: string; refId: string }> };
      const traceRefs = payload.traceRefs?.map((ref) => ({ refType: ref.refType as NodeRef["refType"], refId: ref.refId }));
      const validTraceRefs = traceRefs?.filter((ref) => nodeRefSchema.shape.refType.safeParse(ref.refType).success);
      return {
        notebookId: payload.notebook.id,
        notebookRef: { refType: "notebook", refId: payload.notebook.id },
        ...(validTraceRefs ? { traceRefs: validTraceRefs } : {}),
      };
    },
    async sendTutorTurn({ notebookId, scriptedMessage }) {
      const response = await fetch(`${baseUrl}/api/v1/notebooks/${encodeURIComponent(notebookId)}/tutor/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: [{ role: "user", content: scriptedMessage }],
          data: { activeMode: "learn", selectedNodeRefs: [], action: "prompt", sourceScopePolicy: "soft_source_scope" },
        }),
      });
      if (!response.ok) {
        throw new Error(`Tutor request failed (${response.status}): ${await response.text()}`);
      }

      const events = await readSseEvents(response, "tutor");
      const assistantMessageEvent = [...events].reverse().find(
        (event) => event.eventType === "TEXT_MESSAGE_CONTENT" && typeof event.payload.text === "string",
      ) as
        | (SyntheticLearnerEvalStreamEvent & {
            source: "tutor";
            eventType: "TEXT_MESSAGE_CONTENT";
            payload: { text: string };
          })
        | undefined;
      const assistantMessage = assistantMessageEvent?.payload.text ?? "";
      const sessionId = response.headers.get("x-studyagent-session-id") ?? `sess_${notebookId}`;
      const runId = response.headers.get("x-studyagent-run-id") ?? `run_${notebookId}`;
      return {
        sessionId,
        runId,
        assistantMessage,
        events,
        notebookEvents: [],
        ...(sessionId ? { traceRefs: [{ refType: "session" as const, refId: sessionId }] } : {}),
      };
    },
  };
}

async function readSseEvents(response: Response, source: SyntheticLearnerEvalStreamEvent["source"]): Promise<SyntheticLearnerEvalStreamEvent[]> {
  const reader = response.body?.getReader();
  if (!reader) return [];
  const decoder = new TextDecoder();
  let buffer = "";
  const events: SyntheticLearnerEvalStreamEvent[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseSseFrame(frame, source);
      if (parsed) events.push(parsed);
      boundary = buffer.indexOf("\n\n");
    }
  }
  return events;
}

function parseSseFrame(frame: string, source: SyntheticLearnerEvalStreamEvent["source"]): SyntheticLearnerEvalStreamEvent | null {
  const lines = frame.split("\n");
  const eventType = lines.find((line) => line.startsWith("event: "))?.slice("event: ".length)?.trim();
  const dataLine = lines.find((line) => line.startsWith("data: "))?.slice("data: ".length)?.trim();
  if (!eventType || !dataLine) return null;
  try {
    return {
      source,
      eventType,
      payload: JSON.parse(dataLine) as Record<string, unknown>,
    };
  } catch {
    return { source, eventType, payload: { raw: dataLine } };
  }
}

async function main() {
  const baseUrl = process.env.PUBLIC_API_BASE_URL ?? "http://localhost:4000";
  const api = createHttpSyntheticLearnerEvalApi(baseUrl, process.env.STUDYAGENT_API_COOKIE);
  const matrix = loadTracerBulletSyntheticLearnerEvalMatrix();
  const result = await runSyntheticLearnerEvalSuite({
    matrix,
    api,
    writeTranscript: (line) => {
      process.stdout.write(`${line}\n`);
    },
  });

  await persistSyntheticLearnerEvalRun(baseUrl, process.env.STUDYAGENT_API_COOKIE, result.runRecord);

  process.stdout.write(`REPORT: ${result.runRecord.status} ${result.runRecord.id}\n`);
}

async function persistSyntheticLearnerEvalRun(baseUrl: string, cookie: string | undefined, run: unknown): Promise<void> {
  const response = await fetch(`${baseUrl}/api/v1/eval/runs`, {
    method: "POST",
    headers: {
      ...(cookie ? { cookie } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(run),
  });
  if (!response.ok) {
    throw new Error(`Failed to persist eval run (${response.status}): ${await response.text()}`);
  }
}

if (isMain) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
