export const api = (path: string, init?: RequestInit): Promise<Response> => {
  const headers = new Headers(init?.headers);
  const devUserId = window.localStorage.getItem("tutorbook.devUserId");
  if (devUserId) {
    headers.set("X-User-Id", devUserId);
  }
  return fetch(`/api/v1${path}`, { ...init, headers, credentials: "include" });
};

export const rootApi = (path: string, init?: RequestInit): Promise<Response> => {
  const headers = new Headers(init?.headers);
  const devUserId = window.localStorage.getItem("tutorbook.devUserId");
  if (devUserId) {
    headers.set("X-User-Id", devUserId);
  }
  return fetch(path, { ...init, headers, credentials: "include" });
};

export async function fetchReplayPolicy(): Promise<{
  enabled: boolean;
  sampleRate: number;
  disabledUntil: string | null;
}> {
  const response = await api("/analytics/replay-policy");
  if (!response.ok) {
    return { enabled: false, sampleRate: 0, disabledUntil: null };
  }
  return response.json() as Promise<{
    enabled: boolean;
    sampleRate: number;
    disabledUntil: string | null;
  }>;
}

export function recordPublicAnalyticsEvent(
  eventName: "visitor_page_view" | "login_redirect",
  properties: Record<string, unknown> = {},
): void {
  void api("/analytics/public-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName, properties }),
  }).catch(() => undefined);
}

export type MeResponse = {
  user: { id: string; email: string; displayName: string | null } | null;
  authenticated: boolean;
  disabled: boolean;
  consentAccepted: boolean;
  consentVersion: string | null;
  entitlements: {
    studyAccess: boolean;
    ingestionAccess: boolean;
    adminAccess: boolean;
  };
  credits?: CreditsSummary;
  onboarding?: OnboardingState;
};

export type CreditsSummary = {
  percentRemaining: number;
  exhausted: boolean;
  tutorCreditsCents?: number;
  ingestionCreditsCents?: number;
};

export type OnboardingState = {
  completed: boolean;
  studyGoal?: string;
  level?: string;
  skipped?: boolean;
};

type MeApiPayload = {
  user?: { id: string; email: string; displayName: string | null };
  actor?: { id: string; email: string };
  authenticated?: boolean;
  disabled?: boolean;
  consentAccepted?: boolean;
  consentVersion?: string | null;
  entitlements?: {
    studyAccess: boolean;
    ingestionAccess: boolean;
    adminAccess: boolean;
  };
  productState?: {
    studyAccess: number;
    ingestionAccess: number;
    adminAccess: number;
  };
  consent?: {
    accepted: boolean;
    requiredVersion: string;
  };
  credits?: CreditsSummary;
  onboarding?: OnboardingState;
  onboardingJson?: Record<string, unknown>;
  code?: string;
  message?: string;
};

function mapOnboardingState(body: MeApiPayload): OnboardingState | undefined {
  if (body.onboarding) {
    return body.onboarding;
  }
  const json = body.onboardingJson;
  if (!json || typeof json !== "object") {
    return undefined;
  }
  const completed = Boolean(json.completed || json.skipped);
  return {
    completed,
    ...(typeof json.studyGoal === "string" ? { studyGoal: json.studyGoal } : {}),
    ...(typeof json.level === "string" ? { level: json.level } : {}),
    ...(json.skipped ? { skipped: true } : {}),
  };
}

function mapMeResponse(body: MeApiPayload): MeResponse {
  const user = body.user ?? (body.actor ? { ...body.actor, displayName: null } : null);
  const entitlements = body.entitlements ?? {
    studyAccess: (body.productState?.studyAccess ?? 0) > 0,
    ingestionAccess: (body.productState?.ingestionAccess ?? 0) > 0,
    adminAccess: (body.productState?.adminAccess ?? 0) > 0,
  };

  const onboarding = mapOnboardingState(body);

  return {
    user,
    authenticated: body.authenticated ?? Boolean(user),
    disabled: body.disabled ?? false,
    consentAccepted: body.consentAccepted ?? body.consent?.accepted ?? false,
    consentVersion:
      body.consentVersion ?? (body.consent?.accepted ? body.consent.requiredVersion : null),
    entitlements,
    ...(body.credits ? { credits: body.credits } : {}),
    ...(onboarding ? { onboarding } : {}),
  };
}

export async function fetchMe(): Promise<MeResponse> {
  const res = await api("/me");
  const body = (await res.json()) as MeApiPayload;
  if (!res.ok) {
    if (res.status === 401) {
      return mapMeResponse({ authenticated: false });
    }
    throw new Error(body.message ?? "Failed to load session");
  }
  return mapMeResponse(body);
}

export type StudyTemplateSummary = {
  id: string;
  slug: string;
  title: string;
  topic: string;
  sourceLevel: string;
  estimatedMinutes: number;
  studyMode: string;
  expectedOutcome: string;
};

export async function fetchStudyTemplates(): Promise<StudyTemplateSummary[]> {
  const res = await api("/study-templates");
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const data = (await res.json()) as { templates: StudyTemplateSummary[] };
  return data.templates;
}

export async function fetchStudyTemplate(id: string): Promise<StudyTemplateSummary> {
  const res = await api(`/study-templates/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const data = (await res.json()) as { template: StudyTemplateSummary };
  return data.template;
}

export type PersonalWorkspaceSummary = {
  id: string;
  title: string;
  studyTemplateId: string | null;
  templateNotebookId: string | null;
  createdAt: string;
  updatedAt: string;
  template: StudyTemplateSummary | null;
};

export async function fetchPersonalWorkspaces(): Promise<PersonalWorkspaceSummary[]> {
  const res = await api("/workspaces");
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const data = (await res.json()) as { workspaces: PersonalWorkspaceSummary[] };
  return data.workspaces;
}

export async function createWorkspaceFromTemplate(templateId: string): Promise<string> {
  const res = await api("/workspaces/from-template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateId }),
  });
  const body = (await res.json()) as { notebookId?: string; message?: string; code?: string };
  if (!res.ok) {
    throw new Error(body.message ?? "Failed to create workspace");
  }
  if (!body.notebookId) {
    throw new Error("Workspace created but no notebook id was returned");
  }
  return body.notebookId;
}

export type NotebookSummary = {
  id: string;
  title: string;
  workspaceType: string;
  updatedAt: string;
};

export async function fetchNotebooks(): Promise<NotebookSummary[]> {
  const res = await api("/notebooks");
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const data = (await res.json()) as { notebooks: NotebookSummary[] };
  return data.notebooks;
}

export async function deleteWorkspace(notebookId: string): Promise<void> {
  const res = await api(`/workspaces/${encodeURIComponent(notebookId)}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "Failed to delete workspace");
  }
}

export async function deleteSource(sourceId: string): Promise<void> {
  const res = await api(`/sources/${encodeURIComponent(sourceId)}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "Failed to delete source");
  }
}

export async function fetchCredits(): Promise<
  Pick<CreditsSummary, "percentRemaining" | "exhausted">
> {
  const res = await api("/credits");
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return (await res.json()) as Pick<CreditsSummary, "percentRemaining" | "exhausted">;
}

export type AccountSourceSummary = {
  id: string;
  title: string;
  notebookId: string;
  notebookTitle: string;
};

export async function fetchAccountSources(): Promise<AccountSourceSummary[]> {
  const notebooks = await fetchNotebooks();
  const personal = notebooks.filter((notebook) => notebook.workspaceType === "personal_learner");
  const sourceLists = await Promise.all(
    personal.map(async (notebook) => {
      const res = await api(`/notebooks/${encodeURIComponent(notebook.id)}/sources`);
      if (!res.ok) {
        return [] as AccountSourceSummary[];
      }
      const data = (await res.json()) as { sources: Array<{ id: string; title: string }> };
      return data.sources.map((source) => ({
        id: source.id,
        title: source.title,
        notebookId: notebook.id,
        notebookTitle: notebook.title,
      }));
    }),
  );
  return sourceLists.flat();
}

export type IngestionStatusView = {
  status: string;
  queued: boolean;
  processing: boolean;
  ready: boolean;
  failed: boolean;
  retryNeeded: boolean;
  reviewNeeded: boolean;
};

export async function fetchSourceIngestionStatus(sourceId: string): Promise<IngestionStatusView> {
  const res = await api(`/sources/${encodeURIComponent(sourceId)}/ingestion-status`);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return (await res.json()) as IngestionStatusView;
}

export async function retrySourceIngestion(sourceId: string): Promise<void> {
  const res = await api(`/sources/${encodeURIComponent(sourceId)}/retry-ingestion`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "Failed to retry ingestion");
  }
}

export async function submitOnboarding(input: {
  studyGoal?: string;
  level?: string;
  skipped?: boolean;
}): Promise<OnboardingState> {
  const res = await api("/me/onboarding", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as { onboarding?: OnboardingState; message?: string };
  if (!res.ok) {
    throw new Error(body.message ?? "Failed to save onboarding");
  }
  return body.onboarding ?? { completed: true, ...input };
}

export type CreditCheckoutPack = {
  id: string;
  label: string;
  creditType: "tutor" | "ingestion";
  priceCents: number;
  currency: "usd";
  description: string;
};

export async function fetchCreditCheckoutPacks(): Promise<CreditCheckoutPack[] | null> {
  const res = await api("/checkout/credits/packs");
  if (res.status === 404) {
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    if (body.code === "feature_disabled") {
      return null;
    }
  }
  if (!res.ok) {
    throw new Error("Failed to load credit packs");
  }
  const data = (await res.json()) as { packs: CreditCheckoutPack[] };
  return data.packs;
}

export async function startCreditCheckout(packId: string): Promise<string> {
  const res = await api("/checkout/credits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packId }),
  });
  const body = (await res.json()) as { checkoutUrl?: string; message?: string; code?: string };
  if (!res.ok) {
    throw new Error(body.message ?? "Failed to start checkout");
  }
  if (!body.checkoutUrl) {
    throw new Error("Checkout started but no redirect URL was returned");
  }
  return body.checkoutUrl;
}

export async function submitAccountDeletionRequest(notes: string): Promise<void> {
  const res = await api("/account/deletion-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "Failed to submit account deletion request");
  }
}
