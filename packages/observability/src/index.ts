export type TraceContext = {
  traceId: string;
  requestId?: string;
  sessionId?: string;
  runId?: string;
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
};

type ObservationLike = {
  update(payload: Record<string, unknown>): void;
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

type NodeSdkLike = { start(): void; shutdown(): Promise<void> };

type LangfuseOtelModule = {
  LangfuseSpanProcessor?: new (options: Record<string, unknown>) => unknown;
};

type OtelSdkNodeModule = {
  NodeSDK?: new (options: Record<string, unknown>) => NodeSdkLike;
};

const noopObservation: ObservationLike = {
  update() {},
  end() {},
};

let tracingModulePromise: Promise<LangfuseTracingModule | null> | null = null;
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
    tracingModulePromise = importOptionalModule<LangfuseTracingModule>("@langfuse/tracing");
  }
  return tracingModulePromise;
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
  langfuseSdk = null;
  tracingEnabled = false;
  if (sdk) {
    await sdk.shutdown();
  }
}

export function startObservation(
  name: string,
  payload?: Record<string, unknown>,
  options?: Record<string, unknown>,
): ObservationLike {
  void name;
  void payload;
  void options;

  const promise = getTracingModulePromise();
  void promise;
  return {
    update(updatePayload) {
      void updatePayload;
    },
    end() {},
  };
}

export async function startActiveObservation<T>(
  name: string,
  fn: (observation: ObservationLike) => T | Promise<T>,
  options?: Record<string, unknown>,
): Promise<T> {
  const tracing = await getTracingModulePromise();
  if (tracing?.startActiveObservation) {
    return await tracing.startActiveObservation(name, fn, options);
  }
  return await fn(noopObservation);
}

export function updateActiveObservation(payload: Record<string, unknown>): void {
  void getTracingModulePromise().then((tracing) => tracing?.updateActiveObservation?.(payload));
}

export function getLangfuseTracer(...args: unknown[]): unknown {
  void args;
  return null;
}
