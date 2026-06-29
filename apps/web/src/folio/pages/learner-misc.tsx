import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FileStack, ShieldCheck } from "lucide-react";
import {
  createNotebook,
  createWorkspaceFromTemplate,
  sessionQueryKey,
  studyTemplateQueryOptions,
  studyTemplatesQueryOptions,
  submitConsent,
} from "@studyagent/api-client";
import { apiClient } from "../../platform/api-client.js";
import { Badge, Button, Eyebrow } from "../ui/primitives.js";

/* ------------------------------------------------------------------ Consent */
export function ConsentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!accepted) return;
    setPending(true);
    setError(null);
    try {
      await submitConsent(apiClient.request);
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey() });
      void navigate({ to: "/app" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save consent");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-6 py-12">
      <div className="w-full max-w-lg rounded-[calc(var(--radius)+4px)] border border-border bg-elevated p-8 shadow-soft">
        <Badge tone="warning">
          <ShieldCheck className="h-3 w-3" /> Beta
        </Badge>
        <h1 className="mt-3 font-display text-[26px] font-semibold leading-tight">Before you begin</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          TutorBook is an experimental beta. The tutor answers from the sources you upload and may
          make mistakes — verify important answers. Reading your materials and browsing the study
          map are free; AI tutor turns use credits.
        </p>
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-border bg-card p-3.5">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          />
          <span className="text-[13.5px] leading-relaxed">
            I understand this is a beta and agree to the Terms and Privacy Policy.
          </span>
        </label>
        {error ? (
          <p className="mt-3 rounded-[var(--radius)] bg-destructive/12 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
        <Button className="mt-5 w-full" size="lg" disabled={!accepted || pending} onClick={() => void submit()}>
          {pending ? "Saving…" : "Accept & continue"} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- Create workspace */
export function WorkspaceCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!title.trim()) return;
    setPending(true);
    setError(null);
    try {
      const id = await createNotebook(apiClient.request, title.trim());
      await queryClient.invalidateQueries();
      if (id) void navigate({ to: "/notebooks/$notebookId", params: { notebookId: id } });
      else void navigate({ to: "/app/notebooks" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create notebook");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg px-6 pb-20 pt-16">
      <Eyebrow>New</Eyebrow>
      <h1 className="mt-2 font-display text-[clamp(1.9rem,4vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em]">
        Create a notebook
      </h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        Name your study notebook. You can add sources and start a tutor session next.
      </p>
      <label className="mt-6 block">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Notebook title
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void create()}
          placeholder="e.g. Organic Chemistry I"
          className="mt-1.5 w-full rounded-[var(--radius)] border border-border bg-elevated px-3 py-2.5 text-[15px] outline-none focus:border-accent"
        />
      </label>
      {error ? (
        <p className="mt-3 rounded-[var(--radius)] bg-destructive/12 px-3 py-2 text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex gap-2">
        <Button size="lg" disabled={!title.trim() || pending} onClick={() => void create()}>
          {pending ? "Creating…" : "Create notebook"} <ArrowRight className="h-4 w-4" />
        </Button>
        <Button size="lg" variant="outline" onClick={() => navigate({ to: "/app/notebooks" })}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Templates */
export function TemplatesPage() {
  const navigate = useNavigate();
  const templatesQuery = useQuery(studyTemplatesQueryOptions(apiClient.request));

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-20 pt-10">
      <Eyebrow>Study templates</Eyebrow>
      <h1 className="mt-2 font-display text-[clamp(1.9rem,4vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em]">
        Published curricula
      </h1>
      {templatesQuery.isLoading ? (
        <p className="mt-6 text-[14px] text-muted-foreground">Loading templates…</p>
      ) : null}
      {templatesQuery.isError ? (
        <p className="mt-6 text-[14px] text-destructive">Could not load templates.</p>
      ) : null}
      <ul className="mt-6 space-y-3">
        {(templatesQuery.data ?? []).map((template) => (
          <li key={template.id}>
            <button
              type="button"
              className="w-full rounded-[var(--radius)] border border-border bg-card/60 px-5 py-4 text-left transition-colors hover:border-accent hover:bg-accent/5"
              onClick={() =>
                navigate({
                  to: "/app/templates/$templateId",
                  params: { templateId: template.id },
                })
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-[18px] font-semibold">{template.title}</h2>
                <Badge tone="accent">{template.estimatedMinutes} min</Badge>
              </div>
              <p className="mt-1 text-[13.5px] text-muted-foreground">{template.topic}</p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {template.studyMode} · {template.sourceLevel}
              </p>
            </button>
          </li>
        ))}
      </ul>
      {!templatesQuery.isLoading && (templatesQuery.data ?? []).length === 0 ? (
        <div className="mt-6 rounded-[var(--radius)] border border-dashed border-border bg-card/40 px-6 py-12 text-center">
          <FileStack className="mx-auto h-8 w-8 text-accent" />
          <p className="mt-3 text-[14px] text-muted-foreground">No published templates yet.</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/app/workspaces/new" })}>
            New notebook <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function TemplateDetailPage({ templateId }: { templateId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const templateQuery = useQuery(studyTemplateQueryOptions(apiClient.request, templateId));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setPending(true);
    setError(null);
    try {
      const notebookId = await createWorkspaceFromTemplate(apiClient.request, templateId);
      await queryClient.invalidateQueries();
      void navigate({ to: "/notebooks/$notebookId", params: { notebookId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setPending(false);
    }
  };

  const template = templateQuery.data;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 pb-20 pt-16">
      <button
        type="button"
        className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        onClick={() => navigate({ to: "/app/templates" })}
      >
        ← Templates
      </button>
      {templateQuery.isLoading ? (
        <p className="mt-4 text-[14px] text-muted-foreground">Loading…</p>
      ) : null}
      {template ? (
        <>
          <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight">
            {template.title}
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground">{template.expectedOutcome}</p>
          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Topic
              </dt>
              <dd className="mt-0.5 text-[14px]">{template.topic}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Level
              </dt>
              <dd className="mt-0.5 text-[14px]">{template.sourceLevel}</dd>
            </div>
          </dl>
          {error ? (
            <p className="mt-4 rounded-[var(--radius)] bg-destructive/12 px-3 py-2 text-[13px] text-destructive">
              {error}
            </p>
          ) : null}
          <Button className="mt-6" size="lg" disabled={pending} onClick={() => void start()}>
            {pending ? "Creating…" : "Start from template"} <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      ) : null}
    </div>
  );
}
