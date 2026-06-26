const SCRUBBED = "[Filtered]";

const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|source_?text|transcript|password|secret|token|session|set-cookie/i;

export type SentryScrubbableEvent = {
  message?: string;
  exception?: {
    values?: Array<Record<string, unknown> & { value?: string }>;
  };
  request?: {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    data?: unknown;
  };
  extra?: Record<string, unknown>;
  contexts?: Record<string, Record<string, unknown>>;
  breadcrumbs?: Array<{ data?: Record<string, unknown>; message?: string }>;
  user?: Record<string, unknown>;
};

type SentryClientModule = {
  init: (options: Record<string, unknown>) => void;
  captureException: (error: unknown, context?: { extra?: Record<string, unknown> }) => string;
};

let sentryClient: SentryClientModule | null = null;
let sentryInitialized = false;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 0 ? SCRUBBED : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => scrubValue(entry));
  }
  if (typeof value === "object" && value !== null) {
    return scrubRecord(value as Record<string, unknown>);
  }
  return SCRUBBED;
}

export function scrubRecord(record: Record<string, unknown>): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isSensitiveKey(key)) {
      scrubbed[key] = SCRUBBED;
      continue;
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      scrubbed[key] = scrubRecord(value as Record<string, unknown>);
      continue;
    }
    scrubbed[key] = value;
  }
  return scrubbed;
}

function scrubStringRecord(record: Record<string, string>): Record<string, string> {
  return scrubRecord(record) as Record<string, string>;
}

export function scrubEvent<T extends SentryScrubbableEvent>(event: T): T {
  const next: SentryScrubbableEvent = { ...event };
  if (event.message) {
    next.message = SCRUBBED;
  }
  if (event.exception?.values) {
    next.exception = {
      ...event.exception,
      values: event.exception.values.map((value) => ({
        ...value,
        ...(value.value ? { value: SCRUBBED } : {}),
      })),
    };
  }

  if (event.request) {
    next.request = {
      ...event.request,
      ...(event.request.headers ? { headers: scrubStringRecord(event.request.headers) } : {}),
      ...(event.request.cookies ? { cookies: scrubStringRecord(event.request.cookies) } : {}),
      ...(event.request.data !== undefined ? { data: scrubValue(event.request.data) } : {}),
    };
  }

  if (event.extra) {
    next.extra = scrubRecord(event.extra);
  }

  if (event.contexts) {
    next.contexts = Object.fromEntries(
      Object.entries(event.contexts).map(([key, value]) => [key, scrubRecord(value)]),
    );
  }

  if (event.breadcrumbs) {
    next.breadcrumbs = event.breadcrumbs.map((breadcrumb) => ({
      ...breadcrumb,
      ...(breadcrumb.message ? { message: SCRUBBED } : {}),
      ...(breadcrumb.data ? { data: scrubRecord(breadcrumb.data) } : {}),
    }));
  }

  if (event.user) {
    next.user = scrubRecord(event.user);
  }

  return next as T;
}

async function importSentryClient(runtime: "node" | "browser"): Promise<SentryClientModule | null> {
  try {
    const specifier = runtime === "browser" ? "@sentry/react" : "@sentry/node";
    const importer = new Function("s", "return import(s)") as (
      s: string,
    ) => Promise<SentryClientModule>;
    return await importer(specifier);
  } catch {
    return null;
  }
}

function detectRuntime(): "node" | "browser" {
  return typeof window !== "undefined" && typeof window.document !== "undefined"
    ? "browser"
    : "node";
}

export function initSentry(
  dsn: string | undefined,
  environment: string | undefined,
  release: string | undefined,
  options?: { runtime?: "node" | "browser"; client?: SentryClientModule },
): void {
  const trimmedDsn = dsn?.trim();
  if (!trimmedDsn || sentryInitialized) {
    return;
  }

  const runtime = options?.runtime ?? detectRuntime();
  void (async () => {
    const client = options?.client ?? (await importSentryClient(runtime));
    if (!client) {
      console.warn("Sentry packages are unavailable; continuing without error monitoring");
      return;
    }

    client.init({
      dsn: trimmedDsn,
      ...(environment?.trim() ? { environment: environment.trim() } : {}),
      ...(release?.trim() ? { release: release.trim() } : {}),
      beforeSend(event: SentryScrubbableEvent) {
        return scrubEvent(event);
      },
    });

    sentryClient = client;
    sentryInitialized = true;
  })();
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const scrubbedContext = context ? scrubRecord(context) : undefined;
  if (!sentryClient) {
    return;
  }
  sentryClient.captureException(error, scrubbedContext ? { extra: scrubbedContext } : undefined);
}

export function resetSentryForTests(): void {
  sentryClient = null;
  sentryInitialized = false;
}
