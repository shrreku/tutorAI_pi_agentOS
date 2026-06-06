export type TraceContext = {
  traceId: string;
  requestId?: string;
  sessionId?: string;
  runId?: string;
  traceparent?: string;
  parentSpanId?: string;
  traceFlags?: string;
};

export type ParsedTraceparent = {
  version: string;
  traceId: string;
  parentSpanId: string;
  traceFlags: string;
};

export type CorrelationContext = TraceContext & {
  traceparent: string;
  parentSpanId: string;
  traceFlags: string;
};

export type TraceUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
};

export type UsageLike = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number };
};

export function createTraceContext(seed: string = crypto.randomUUID()): TraceContext {
  return { traceId: seed };
}

export function createRequestId(prefix = "req"): string {
  const cleanedPrefix = prefix.replace(/[^a-zA-Z0-9_:-]/g, "_") || "req";
  return `${cleanedPrefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function createW3CTraceId(): string {
  return createNonZeroHexId(32);
}

export function createW3CSpanId(): string {
  return createNonZeroHexId(16);
}

export function parseTraceparent(value: string | null | undefined): ParsedTraceparent | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(?:-.+)?$/i.exec(trimmed);
  if (!match) return null;
  const [, version = "", traceId = "", parentSpanId = "", traceFlags = ""] = match.map((part) => part.toLowerCase());
  if (version === "ff") return null;
  if (!isNonZeroHex(traceId) || !isNonZeroHex(parentSpanId)) return null;
  return { version, traceId, parentSpanId, traceFlags };
}

export function formatTraceparent(input: {
  traceId: string;
  parentSpanId?: string | null;
  traceFlags?: string | null;
}): string {
  const traceId = isValidTraceId(input.traceId) ? input.traceId.toLowerCase() : createW3CTraceId();
  const parentSpanId = isValidSpanId(input.parentSpanId) ? input.parentSpanId!.toLowerCase() : createW3CSpanId();
  const traceFlags = /^[0-9a-f]{2}$/i.test(input.traceFlags ?? "") ? input.traceFlags!.toLowerCase() : "00";
  return `00-${traceId}-${parentSpanId}-${traceFlags}`;
}

export function createCorrelationContext(input: {
  traceparent?: string | null;
  requestId?: string | null;
  traceId?: string | null;
  sessionId?: string;
  runId?: string;
} = {}): CorrelationContext {
  const parsed = parseTraceparent(input.traceparent);
  const traceId = parsed?.traceId ?? (isValidTraceId(input.traceId) ? input.traceId!.toLowerCase() : createW3CTraceId());
  const parentSpanId = createW3CSpanId();
  const traceFlags = parsed?.traceFlags ?? "00";
  return {
    traceId,
    parentSpanId,
    traceFlags,
    traceparent: formatTraceparent({ traceId, parentSpanId, traceFlags }),
    requestId: input.requestId?.trim() || createRequestId(),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
  };
}

export function correlationAttributes(context: TraceContext | null | undefined): Record<string, string> {
  if (!context) return {};
  return Object.fromEntries(
    Object.entries({
      traceId: context.traceId,
      requestId: context.requestId,
      sessionId: context.sessionId,
      runId: context.runId,
      traceparent: context.traceparent,
    }).filter(([, value]) => typeof value === "string" && value.length > 0),
  ) as Record<string, string>;
}

function createNonZeroHexId(length: 16 | 32): string {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const value = crypto.randomUUID().replaceAll("-", "").slice(0, length).toLowerCase();
    if (isNonZeroHex(value)) return value;
  }
  return "1".padStart(length, "0");
}

function isValidTraceId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/i.test(value) && isNonZeroHex(value);
}

function isValidSpanId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{16}$/i.test(value) && isNonZeroHex(value);
}

function isNonZeroHex(value: string): boolean {
  return /^[0-9a-f]+$/i.test(value) && !/^0+$/.test(value);
}

export function normalizeTraceUsage(usage: UsageLike | null | undefined): TraceUsage | undefined {
  if (!usage) {
    return undefined;
  }

  const normalized: TraceUsage = {
    input: Math.max(0, Math.trunc(usage.input ?? 0)),
    output: Math.max(0, Math.trunc(usage.output ?? 0)),
    cacheRead: Math.max(0, Math.trunc(usage.cacheRead ?? 0)),
    cacheWrite: Math.max(0, Math.trunc(usage.cacheWrite ?? 0)),
    totalTokens: Math.max(0, Math.trunc(usage.totalTokens ?? 0)),
    cost: {
      input: Math.max(0, usage.cost?.input ?? 0),
      output: Math.max(0, usage.cost?.output ?? 0),
      cacheRead: Math.max(0, usage.cost?.cacheRead ?? 0),
      cacheWrite: Math.max(0, usage.cost?.cacheWrite ?? 0),
      total: Math.max(0, usage.cost?.total ?? 0),
    },
  };

  if (normalized.totalTokens === 0 && normalized.input + normalized.output + normalized.cacheRead + normalized.cacheWrite === 0) {
    return undefined;
  }

  return normalized;
}

export function formatTraceUsage(usage: TraceUsage | undefined): string {
  if (!usage) {
    return "";
  }

  const parts = [`↑${usage.input}`, `↓${usage.output}`];
  if (usage.cacheRead > 0) parts.push(`R${usage.cacheRead}`);
  if (usage.cacheWrite > 0) parts.push(`W${usage.cacheWrite}`);
  if (usage.totalTokens > 0) parts.push(`ctx:${usage.totalTokens}`);
  if (usage.cost.total > 0) parts.push(`$${usage.cost.total.toFixed(4)}`);
  return parts.join(" ");
}

type LangfuseTracingConfig = {
  LANGFUSE_PUBLIC_KEY?: string | undefined;
  LANGFUSE_SECRET_KEY?: string | undefined;
  LANGFUSE_BASE_URL?: string | undefined;
  LANGFUSE_TRACING_ENVIRONMENT?: string | undefined;
  LANGFUSE_RELEASE?: string | undefined;
  LANGFUSE_FLUSH_AT?: number | undefined;
  LANGFUSE_FLUSH_INTERVAL?: number | undefined;
  LANGFUSE_PROMPT_LABEL?: string | undefined;
  LANGFUSE_PROMPT_CACHE_TTL_SECONDS?: number | undefined;
  LANGFUSE_PROMPT_FETCH_TIMEOUT_MS?: number | undefined;
};

export type ObservationLike = {
  update(payload: Record<string, unknown>): void;
  updateTrace?(payload: Record<string, unknown>): void;
  end(): void;
};

type LangfuseTracingModule = {
  getLangfuseTracer?: (...args: unknown[]) => unknown;
  setLangfuseTracerProvider?: (provider: unknown) => void;
  startActiveObservation?: <T>(
    name: string,
    fn: (observation: ObservationLike) => T | Promise<T>,
    options?: Record<string, unknown>,
  ) => T | Promise<T>;
  startObservation?: (name: string, payload?: Record<string, unknown>, options?: Record<string, unknown>) => ObservationLike;
  updateActiveObservation?: (payload: Record<string, unknown>) => void;
};

type LangfuseTextPromptClientLike = {
  name: string;
  version: number;
  type: "text";
  labels: string[];
  isFallback: boolean;
  compile(variables?: Record<string, string>): string;
};

type LangfuseClientLike = {
  prompt: {
    get(
      name: string,
      options?: {
        type?: "text";
        version?: number;
        label?: string;
        cacheTtlSeconds?: number;
        fallback?: string;
        maxRetries?: number;
        fetchTimeoutMs?: number;
      },
    ): Promise<LangfuseTextPromptClientLike>;
    create(body: {
      name: string;
      type: "text";
      prompt: string;
      config?: unknown;
      labels?: string[];
      tags?: string[];
      commitMessage?: string;
    }): Promise<LangfuseTextPromptClientLike>;
  };
  flush?: () => Promise<void>;
  shutdown?: () => Promise<void>;
};

type LangfuseClientModule = {
  LangfuseClient?: new (params?: {
    publicKey?: string;
    secretKey?: string;
    baseUrl?: string;
    timeout?: number;
  }) => LangfuseClientLike;
};

type NodeSdkLike = { start(): void; shutdown(): Promise<void> };

type LangfuseOtelModule = {
  LangfuseSpanProcessor?: new (options: Record<string, unknown>) => unknown;
};

type OtelSdkNodeModule = {
  NodeSDK?: new (options: Record<string, unknown>) => NodeSdkLike;
};

const noopObservation: ObservationLike = {
  update() {},
  updateTrace() {},
  end() {},
};

function normalizeObservation(observation: unknown): ObservationLike {
  const candidate = observation && typeof observation === "object" ? (observation as Partial<ObservationLike>) : {};
  const updateTrace =
    typeof candidate.updateTrace === "function"
      ? (payload: Record<string, unknown>) => {
          candidate.updateTrace?.(payload);
        }
      : noopObservation.updateTrace;
  return {
    update:
      typeof candidate.update === "function"
        ? (payload) => {
            candidate.update?.(payload);
          }
        : noopObservation.update,
    ...(updateTrace ? { updateTrace } : {}),
    end:
      typeof candidate.end === "function"
        ? () => {
            candidate.end?.();
          }
        : noopObservation.end,
  };
}

let tracingModulePromise: Promise<LangfuseTracingModule | null> | null = null;
let tracingModule: LangfuseTracingModule | null = null;
let langfuseClientPromise: Promise<LangfuseClientLike | null> | null = null;
let langfuseClient: LangfuseClientLike | null = null;
let langfuseSdk: NodeSdkLike | null = null;
let tracingEnabled = false;

async function importOptionalModule<T>(specifier: string): Promise<T | null> {
  try {
    const importer = new Function("s", "return import(s)") as (s: string) => Promise<T>;
    return await importer(specifier);
  } catch {
    return null;
  }
}

function getTracingModulePromise(): Promise<LangfuseTracingModule | null> {
  if (!tracingModulePromise) {
    tracingModulePromise = importOptionalModule<LangfuseTracingModule>("@langfuse/tracing").then((module) => {
      tracingModule = module;
      return module;
    });
  }
  return tracingModulePromise;
}

function getLangfuseClientPromise(env: LangfuseTracingConfig): Promise<LangfuseClientLike | null> {
  const publicKey = env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = env.LANGFUSE_SECRET_KEY?.trim();
  if (!publicKey || !secretKey) return Promise.resolve(null);
  if (!langfuseClientPromise) {
    langfuseClientPromise = importOptionalModule<LangfuseClientModule>("@langfuse/client").then((module) => {
      const LangfuseClient = module?.LangfuseClient;
      if (!LangfuseClient) return null;
      langfuseClient = new LangfuseClient({
        publicKey,
        secretKey,
        ...(env.LANGFUSE_BASE_URL?.trim() ? { baseUrl: env.LANGFUSE_BASE_URL.trim() } : {}),
        ...(env.LANGFUSE_PROMPT_FETCH_TIMEOUT_MS != null
          ? { timeout: Math.max(1, Math.ceil(env.LANGFUSE_PROMPT_FETCH_TIMEOUT_MS / 1000)) }
          : {}),
      });
      return langfuseClient;
    });
  }
  return langfuseClientPromise;
}

export function initializeLangfuseTracing(serviceName: string, env: LangfuseTracingConfig): boolean {
  const publicKey = env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = env.LANGFUSE_SECRET_KEY?.trim();

  if (!publicKey || !secretKey || langfuseSdk || tracingEnabled) {
    return Boolean(publicKey && secretKey);
  }

  void (async () => {
    const [otelModule, sdkNodeModule, tracingModule] = await Promise.all([
      importOptionalModule<LangfuseOtelModule>("@langfuse/otel"),
      importOptionalModule<OtelSdkNodeModule>("@opentelemetry/sdk-node"),
      getTracingModulePromise(),
    ]);

    const LangfuseSpanProcessor = otelModule?.LangfuseSpanProcessor;
    const NodeSDK = sdkNodeModule?.NodeSDK;
    if (!LangfuseSpanProcessor || !NodeSDK) {
      console.warn("Langfuse tracing packages are unavailable; continuing without tracing");
      return;
    }

    try {
      const spanProcessor = new LangfuseSpanProcessor({
        publicKey,
        secretKey,
        ...(env.LANGFUSE_BASE_URL?.trim() ? { baseUrl: env.LANGFUSE_BASE_URL.trim() } : {}),
        ...(env.LANGFUSE_TRACING_ENVIRONMENT?.trim()
          ? { environment: env.LANGFUSE_TRACING_ENVIRONMENT.trim() }
          : {}),
        ...(env.LANGFUSE_RELEASE?.trim() ? { release: env.LANGFUSE_RELEASE.trim() } : {}),
        ...(env.LANGFUSE_FLUSH_AT != null ? { flushAt: env.LANGFUSE_FLUSH_AT } : {}),
        ...(env.LANGFUSE_FLUSH_INTERVAL != null ? { flushInterval: env.LANGFUSE_FLUSH_INTERVAL } : {}),
      });

      tracingModule?.setLangfuseTracerProvider?.(null);
      langfuseSdk = new NodeSDK({ serviceName, spanProcessors: [spanProcessor] });
      langfuseSdk.start();
      tracingEnabled = true;
    } catch (error) {
      langfuseSdk = null;
      tracingEnabled = false;
      console.warn("Failed to initialize Langfuse tracing:", error);
    }
  })();

  return true;
}

export async function shutdownLangfuseTracing(): Promise<void> {
  const sdk = langfuseSdk;
  const client = langfuseClient;
  langfuseSdk = null;
  langfuseClient = null;
  langfuseClientPromise = null;
  tracingEnabled = false;
  if (client) {
    await client.shutdown?.();
  }
  if (sdk) {
    await sdk.shutdown();
  }
}

export function startObservation(
  name: string,
  payload?: Record<string, unknown>,
  options?: Record<string, unknown>,
): ObservationLike {
  void getTracingModulePromise();
  return normalizeObservation(tracingModule?.startObservation?.(name, payload, options) ?? noopObservation);
}

export async function startActiveObservation<T>(
  name: string,
  fn: (observation: ObservationLike) => T | Promise<T>,
  options?: Record<string, unknown>,
): Promise<T> {
  const tracing = await getTracingModulePromise();
  if (tracing?.startActiveObservation) {
    return await tracing.startActiveObservation(name, (observation) => fn(normalizeObservation(observation)), options);
  }
  return await fn(noopObservation);
}

export function updateActiveObservation(payload: Record<string, unknown>): void {
  void getTracingModulePromise().then((tracing) => tracing?.updateActiveObservation?.(payload));
}

export function getLangfuseTracer(...args: unknown[]): unknown {
  void getTracingModulePromise();
  return tracingModule?.getLangfuseTracer?.(...args) ?? null;
}

export type AgentObservationName =
  | "tutor.turn"
  | "tutor.turn.bootstrap"
  | "model.run"
  | "tool.call"
  | "durable_event.summary"
  | "cache.operation"
  | "ingestion.job"
  | "llamaparse.pdf";

const AGENT_OBSERVATION_TYPES: Record<AgentObservationName, string> = {
  "tutor.turn": "agent",
  "tutor.turn.bootstrap": "chain",
  "model.run": "generation",
  "tool.call": "tool",
  "durable_event.summary": "event",
  "cache.operation": "span",
  "ingestion.job": "chain",
  "llamaparse.pdf": "tool",
};

export function startAgenticObservation(
  name: AgentObservationName,
  payload?: Record<string, unknown>,
): ObservationLike {
  return startObservation(name, payload, { asType: AGENT_OBSERVATION_TYPES[name] });
}

export async function observeAgenticSpan<T>(
  name: AgentObservationName,
  payload: Record<string, unknown>,
  fn: (observation: ObservationLike) => T | Promise<T>,
): Promise<T> {
  return await startActiveObservation(
    name,
    async (observation) => {
      observation.update(payload);
      try {
        return await fn(observation);
      } catch (error) {
        observation.update({
          level: "ERROR",
          statusMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    { asType: AGENT_OBSERVATION_TYPES[name] },
  );
}

export type ManagedTextPromptDefinition = {
  name: string;
  prompt: string;
  config?: unknown;
  labels?: string[];
  tags?: string[];
  commitMessage?: string;
};

export type ResolvedManagedTextPrompt = {
  prompt: string;
  fingerprint: string;
  metadata: {
    name: string;
    type: "text";
    version?: number;
    label?: string;
    isFallback: boolean;
    source: "langfuse" | "local_fallback";
  };
};

export async function resolveManagedTextPrompt(input: {
  env: LangfuseTracingConfig;
  name: string;
  fallback: string;
  variables?: Record<string, string>;
  label?: string;
  version?: number;
  cacheTtlSeconds?: number;
  fetchTimeoutMs?: number;
}): Promise<ResolvedManagedTextPrompt> {
  const label = input.label ?? input.env.LANGFUSE_PROMPT_LABEL ?? "production";
  const fallback = (): ResolvedManagedTextPrompt => ({
    prompt: input.fallback,
    fingerprint: stableTextFingerprint(input.fallback),
    metadata: {
      name: input.name,
      type: "text",
      ...(label ? { label } : {}),
      isFallback: true,
      source: "local_fallback",
    },
  });

  const client = await getLangfuseClientPromise(input.env);
  if (!client) return fallback();

  try {
    const prompt = await client.prompt.get(input.name, {
      type: "text",
      fallback: input.fallback,
      ...(input.version != null ? { version: input.version } : { label }),
      cacheTtlSeconds: input.cacheTtlSeconds ?? input.env.LANGFUSE_PROMPT_CACHE_TTL_SECONDS ?? 300,
      maxRetries: 0,
      fetchTimeoutMs: input.fetchTimeoutMs ?? input.env.LANGFUSE_PROMPT_FETCH_TIMEOUT_MS ?? 750,
    });
    const compiled = prompt.compile(input.variables ?? {});
    return {
      prompt: compiled,
      fingerprint: stableTextFingerprint(compiled),
      metadata: {
        name: prompt.name,
        type: "text",
        version: prompt.version,
        ...(label ? { label } : {}),
        isFallback: prompt.isFallback,
        source: prompt.isFallback ? "local_fallback" : "langfuse",
      },
    };
  } catch {
    return fallback();
  }
}

export async function syncManagedTextPrompts(input: {
  env: LangfuseTracingConfig;
  prompts: ManagedTextPromptDefinition[];
  defaultLabel?: string;
}): Promise<Array<ResolvedManagedTextPrompt["metadata"]>> {
  const client = await getLangfuseClientPromise(input.env);
  if (!client) {
    throw new Error("LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required to sync Langfuse prompts");
  }
  const synced: Array<ResolvedManagedTextPrompt["metadata"]> = [];
  for (const definition of input.prompts) {
    const labels = definition.labels ?? [input.defaultLabel ?? input.env.LANGFUSE_PROMPT_LABEL ?? "production"];
    const created = await client.prompt.create({
      name: definition.name,
      type: "text",
      prompt: definition.prompt,
      ...(definition.config !== undefined ? { config: definition.config } : {}),
      labels,
      ...(definition.tags ? { tags: definition.tags } : {}),
      ...(definition.commitMessage ? { commitMessage: definition.commitMessage } : {}),
    });
    synced.push({
      name: created.name,
      type: "text",
      version: created.version,
      ...(labels[0] ? { label: labels[0] } : {}),
      isFallback: false,
      source: "langfuse",
    });
  }
  await client.flush?.();
  return synced;
}

function stableTextFingerprint(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export type MetricLabels = Record<string, string | number | boolean | null | undefined>;

type MetricKind = "counter" | "gauge" | "histogram";

type MetricDefinition = {
  name: string;
  help: string;
  kind: MetricKind;
  buckets?: number[];
};

type CounterSeries = {
  labels: Record<string, string>;
  value: number;
};

type GaugeSeries = {
  labels: Record<string, string>;
  value: number;
};

type HistogramSeries = {
  labels: Record<string, string>;
  buckets: number[];
  bucketCounts: number[];
  count: number;
  sum: number;
};

export type MetricRegistrySnapshot = {
  counters: Array<{ name: string; help: string; labels: Record<string, string>; value: number }>;
  gauges: Array<{ name: string; help: string; labels: Record<string, string>; value: number }>;
  histograms: Array<{
    name: string;
    help: string;
    labels: Record<string, string>;
    buckets: number[];
    bucketCounts: number[];
    count: number;
    sum: number;
  }>;
};

const DEFAULT_HISTOGRAM_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30];

export class MetricRegistry {
  private definitions = new Map<string, MetricDefinition>();
  private counters = new Map<string, CounterSeries>();
  private gauges = new Map<string, GaugeSeries>();
  private histograms = new Map<string, HistogramSeries>();

  incrementCounter(
    name: string,
    value = 1,
    labels: MetricLabels = {},
    help = "Counter metric.",
  ): void {
    if (!Number.isFinite(value) || value < 0) return;
    const definition = this.defineMetric(name, "counter", help);
    const normalizedLabels = normalizeMetricLabels(labels);
    const key = metricSeriesKey(definition.name, normalizedLabels);
    const existing = this.counters.get(key);
    if (existing) {
      existing.value += value;
      return;
    }
    this.counters.set(key, { labels: normalizedLabels, value });
  }

  setGauge(name: string, value: number, labels: MetricLabels = {}, help = "Gauge metric."): void {
    if (!Number.isFinite(value)) return;
    const definition = this.defineMetric(name, "gauge", help);
    const normalizedLabels = normalizeMetricLabels(labels);
    this.gauges.set(metricSeriesKey(definition.name, normalizedLabels), { labels: normalizedLabels, value });
  }

  observeHistogram(
    name: string,
    value: number,
    labels: MetricLabels = {},
    help = "Histogram metric.",
    buckets = DEFAULT_HISTOGRAM_BUCKETS_SECONDS,
  ): void {
    if (!Number.isFinite(value) || value < 0) return;
    const sortedBuckets = normalizeHistogramBuckets(buckets);
    const definition = this.defineMetric(name, "histogram", help, sortedBuckets);
    const normalizedLabels = normalizeMetricLabels(labels);
    const key = metricSeriesKey(definition.name, normalizedLabels);
    let existing = this.histograms.get(key);
    if (!existing) {
      existing = {
        labels: normalizedLabels,
        buckets: sortedBuckets,
        bucketCounts: sortedBuckets.map(() => 0),
        count: 0,
        sum: 0,
      };
      this.histograms.set(key, existing);
    }
    existing.count += 1;
    existing.sum += value;
    existing.buckets.forEach((bucket, index) => {
      if (value <= bucket) existing.bucketCounts[index] = (existing.bucketCounts[index] ?? 0) + 1;
    });
  }

  snapshot(): MetricRegistrySnapshot {
    const definitionFor = (name: string): MetricDefinition => {
      return this.definitions.get(name) ?? { name, help: "Metric.", kind: "gauge" };
    };
    return {
      counters: [...this.counters.entries()]
        .map(([key, series]) => ({ name: key.split("{", 1)[0]!, help: definitionFor(key.split("{", 1)[0]!).help, ...series }))
        .sort(compareMetricSamples),
      gauges: [...this.gauges.entries()]
        .map(([key, series]) => ({ name: key.split("{", 1)[0]!, help: definitionFor(key.split("{", 1)[0]!).help, ...series }))
        .sort(compareMetricSamples),
      histograms: [...this.histograms.entries()]
        .map(([key, series]) => ({ name: key.split("{", 1)[0]!, help: definitionFor(key.split("{", 1)[0]!).help, ...series }))
        .sort(compareMetricSamples),
    };
  }

  renderPrometheus(): string {
    recordRuntimeMetrics(this);
    const lines: string[] = [];
    const definitions = [...this.definitions.values()].sort((left, right) => left.name.localeCompare(right.name));
    for (const definition of definitions) {
      lines.push(`# HELP ${definition.name} ${escapePrometheusHelp(definition.help)}`);
      lines.push(`# TYPE ${definition.name} ${definition.kind}`);
      if (definition.kind === "counter") {
        for (const sample of this.samplesFor(this.counters, definition.name)) {
          lines.push(`${definition.name}${formatPrometheusLabels(sample.labels)} ${formatMetricNumber(sample.value)}`);
        }
      } else if (definition.kind === "gauge") {
        for (const sample of this.samplesFor(this.gauges, definition.name)) {
          lines.push(`${definition.name}${formatPrometheusLabels(sample.labels)} ${formatMetricNumber(sample.value)}`);
        }
      } else {
        for (const sample of this.samplesFor(this.histograms, definition.name)) {
          sample.buckets.forEach((bucket, index) => {
            lines.push(
              `${definition.name}_bucket${formatPrometheusLabels({ ...sample.labels, le: formatMetricNumber(bucket) })} ${formatMetricNumber(sample.bucketCounts[index] ?? 0)}`,
            );
          });
          lines.push(`${definition.name}_bucket${formatPrometheusLabels({ ...sample.labels, le: "+Inf" })} ${formatMetricNumber(sample.count)}`);
          lines.push(`${definition.name}_sum${formatPrometheusLabels(sample.labels)} ${formatMetricNumber(sample.sum)}`);
          lines.push(`${definition.name}_count${formatPrometheusLabels(sample.labels)} ${formatMetricNumber(sample.count)}`);
        }
      }
    }
    return `${lines.join("\n")}\n`;
  }

  reset(): void {
    this.definitions.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  private defineMetric(name: string, kind: MetricKind, help: string, buckets?: number[]): MetricDefinition {
    const normalizedName = normalizeMetricName(name);
    const existing = this.definitions.get(normalizedName);
    if (existing) return existing;
    const definition: MetricDefinition = {
      name: normalizedName,
      kind,
      help,
      ...(buckets ? { buckets } : {}),
    };
    this.definitions.set(normalizedName, definition);
    return definition;
  }

  private samplesFor<T extends { labels: Record<string, string> }>(
    source: Map<string, T>,
    metricName: string,
  ): T[] {
    return [...source.entries()]
      .filter(([key]) => key === metricName || key.startsWith(`${metricName}{`))
      .map(([, sample]) => sample)
      .sort(compareLabelledSamples);
  }
}

export const defaultMetricRegistry = new MetricRegistry();

export function renderPrometheusMetrics(registry = defaultMetricRegistry): string {
  return registry.renderPrometheus();
}

export function resetObservabilityForTests(registry = defaultMetricRegistry): void {
  registry.reset();
}

export function recordHttpRequestMetric(input: {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  registry?: MetricRegistry;
}): void {
  const registry = input.registry ?? defaultMetricRegistry;
  const labels = {
    method: input.method.toUpperCase(),
    route: normalizeRouteLabel(input.route),
    status_class: `${Math.trunc(input.statusCode / 100)}xx`,
  };
  registry.incrementCounter("studyagent_http_requests_total", 1, labels, "Total HTTP requests handled by StudyAgent.");
  registry.observeHistogram(
    "studyagent_http_request_duration_seconds",
    input.durationMs / 1000,
    labels,
    "HTTP request duration in seconds.",
  );
}

export function recordAgenticCacheMetric(input: {
  namespace: string;
  operation: "get" | "set" | "invalidate" | "delete_expired";
  outcome: "hit" | "miss" | "expired" | "success" | "error" | "skipped";
  deleted?: number;
  durationMs?: number;
  registry?: MetricRegistry;
}): void {
  const registry = input.registry ?? defaultMetricRegistry;
  const labels = {
    namespace: input.namespace,
    operation: input.operation,
    outcome: input.outcome,
  };
  registry.incrementCounter("studyagent_agentic_cache_operations_total", 1, labels, "Agentic cache operations by namespace, operation, and outcome.");
  if (input.deleted != null) {
    registry.incrementCounter(
      "studyagent_agentic_cache_deleted_entries_total",
      Math.max(0, input.deleted),
      { namespace: input.namespace, operation: input.operation },
      "Agentic cache entries deleted by cache maintenance and invalidation.",
    );
  }
  if (input.durationMs != null) {
    registry.observeHistogram(
      "studyagent_agentic_cache_operation_duration_seconds",
      input.durationMs / 1000,
      labels,
      "Agentic cache operation duration in seconds.",
    );
  }
}

export function recordDurableEventMetric(input: {
  eventType: string;
  outcome: "success" | "error";
  durationMs?: number;
  registry?: MetricRegistry;
}): void {
  const registry = input.registry ?? defaultMetricRegistry;
  const labels = {
    event_type: normalizeEventTypeLabel(input.eventType),
    event_family: normalizeEventFamily(input.eventType),
    outcome: input.outcome,
  };
  registry.incrementCounter("studyagent_notebook_events_appended_total", 1, labels, "Durable notebook events appended by event type.");
  if (input.durationMs != null) {
    registry.observeHistogram(
      "studyagent_notebook_event_append_duration_seconds",
      input.durationMs / 1000,
      labels,
      "Durable notebook event append duration in seconds.",
    );
  }
}

export function recordSearchRetrievalFallbackMetric(input: {
  reason: string;
  registry?: MetricRegistry;
}): void {
  const registry = input.registry ?? defaultMetricRegistry;
  registry.incrementCounter(
    "search_retrieval_fallback_total",
    1,
    { reason: normalizeEventTypeLabel(input.reason || "unknown") },
    "Search retrieval fallbacks by reason.",
  );
}

type DurableEventSummaryOutcome = "success" | "error";

type DurableEventSummaryRecord = {
  eventType: string;
  outcome: DurableEventSummaryOutcome;
};

export class DurableEventSummaryCollector {
  private readonly records: DurableEventSummaryRecord[] = [];

  record(eventType: string, outcome: DurableEventSummaryOutcome): void {
    this.records.push({ eventType, outcome });
  }

  recordSuccess(eventType: string): void {
    this.record(eventType, "success");
  }

  recordError(eventType: string): void {
    this.record(eventType, "error");
  }

  snapshot(): Array<DurableEventSummaryRecord> {
    return [...this.records];
  }

  async flush(input: {
    traceId?: string | null;
    sessionId?: string | null;
    runId?: string | null;
    metadata?: Record<string, unknown>;
  } = {}): Promise<void> {
    if (!this.records.length) return;
    const countsByEventType = new Map<string, number>();
    const countsByOutcome = new Map<DurableEventSummaryOutcome, number>();
    for (const record of this.records) {
      countsByEventType.set(record.eventType, (countsByEventType.get(record.eventType) ?? 0) + 1);
      countsByOutcome.set(record.outcome, (countsByOutcome.get(record.outcome) ?? 0) + 1);
    }
    await observeAgenticSpan(
      "durable_event.summary",
      {
        input: {
          eventCount: this.records.length,
          eventTypes: [...new Set(this.records.map((record) => record.eventType))],
        },
        output: {
          records: this.records,
          countsByEventType: Object.fromEntries([...countsByEventType.entries()].sort(([a], [b]) => a.localeCompare(b))),
          countsByOutcome: Object.fromEntries([...countsByOutcome.entries()].sort(([a], [b]) => a.localeCompare(b))),
        },
        metadata: {
          ...(input.traceId ? { traceId: input.traceId } : {}),
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
          ...(input.runId ? { runId: input.runId } : {}),
          ...(input.metadata ?? {}),
        },
      },
      async () => undefined,
    );
  }
}

export function recordIngestionJobMetric(input: {
  backend: "postgres" | "bullmq";
  outcome: "claimed" | "completed" | "failed" | "dead_lettered";
  durationMs?: number;
  registry?: MetricRegistry;
}): void {
  const registry = input.registry ?? defaultMetricRegistry;
  const labels = { backend: input.backend, outcome: input.outcome };
  registry.incrementCounter("studyagent_ingestion_jobs_total", 1, labels, "Ingestion job outcomes by backend.");
  if (input.durationMs != null) {
    registry.observeHistogram(
      "studyagent_ingestion_job_duration_seconds",
      input.durationMs / 1000,
      labels,
      "Ingestion job duration in seconds.",
    );
  }
}

export function startMetricTimer(): () => number {
  const started = Date.now();
  return () => Date.now() - started;
}

function recordRuntimeMetrics(registry: MetricRegistry): void {
  registry.setGauge("studyagent_process_uptime_seconds", process.uptime(), {}, "Process uptime in seconds.");
  const memory = process.memoryUsage();
  registry.setGauge("studyagent_process_memory_rss_bytes", memory.rss, {}, "Resident set size in bytes.");
  registry.setGauge("studyagent_process_memory_heap_used_bytes", memory.heapUsed, {}, "V8 heap used in bytes.");
  registry.setGauge("studyagent_process_memory_heap_total_bytes", memory.heapTotal, {}, "V8 heap total in bytes.");
}

function normalizeMetricName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_:]/g, "_");
  return /^[a-zA-Z_:]/.test(cleaned) ? cleaned : `studyagent_${cleaned}`;
}

function normalizeMetricLabels(labels: MetricLabels): Record<string, string> {
  return Object.fromEntries(
    Object.entries(labels)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [normalizeLabelName(key), String(value)] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizeLabelName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[a-zA-Z_]/.test(cleaned) ? cleaned : `label_${cleaned}`;
}

function normalizeHistogramBuckets(buckets: number[]): number[] {
  return [...new Set(buckets.filter((bucket) => Number.isFinite(bucket) && bucket > 0))]
    .sort((left, right) => left - right);
}

function metricSeriesKey(name: string, labels: Record<string, string>): string {
  const labelEntries = Object.entries(labels);
  if (!labelEntries.length) return name;
  return `${name}{${labelEntries.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(",")}}`;
}

function formatPrometheusLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length) return "";
  return `{${entries.map(([key, value]) => `${key}="${escapePrometheusLabel(value)}"`).join(",")}}`;
}

function escapePrometheusLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function escapePrometheusHelp(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
}

function formatMetricNumber(value: number): string {
  if (value === Number.POSITIVE_INFINITY) return "+Inf";
  if (value === Number.NEGATIVE_INFINITY) return "-Inf";
  if (Number.isNaN(value)) return "NaN";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(12)));
}

function normalizeRouteLabel(route: string): string {
  if (!route || route === "*") return "unknown";
  return route.replace(/\/+/g, "/");
}

function normalizeEventTypeLabel(eventType: string): string {
  return eventType.replace(/[^a-zA-Z0-9_.:-]/g, "_");
}

function normalizeEventFamily(eventType: string): string {
  return normalizeEventTypeLabel(eventType.split(".", 1)[0] ?? "unknown");
}

function compareMetricSamples<T extends { name: string; labels: Record<string, string> }>(left: T, right: T): number {
  return left.name.localeCompare(right.name) || compareLabelledSamples(left, right);
}

function compareLabelledSamples<T extends { labels: Record<string, string> }>(left: T, right: T): number {
  return JSON.stringify(left.labels).localeCompare(JSON.stringify(right.labels));
}
