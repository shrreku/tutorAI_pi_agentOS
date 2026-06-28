import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookText,
  CheckCircle2,
  FileText,
  FolderOpen,
  Mail,
  ShieldAlert,
  Trash2,
  User,
} from "lucide-react";
import {
  deleteSource,
  deleteWorkspace,
  fetchAccountSources,
  fetchNotebooks,
  submitAccountDeletionRequest,
  type AccountSourceSummary,
  type NotebookSummary,
} from "../../routing/api.js";
import { useSession } from "../../routing/RouteGuards.js";
import {
  Avatar,
  Badge,
  Button,
  Eyebrow,
  Field,
  Panel,
  Skeleton,
  Textarea,
} from "../../ui/primitives.js";
import { Reveal, Stagger, StaggerItem } from "../../ui/motion.js";

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function AccountPage() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [deletionNotes, setDeletionNotes] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    data: workspaces = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["account-workspaces"],
    queryFn: fetchNotebooks,
  });

  const { data: sources = [], isLoading: sourcesLoading } = useQuery({
    queryKey: ["account-sources"],
    queryFn: fetchAccountSources,
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: deleteWorkspace,
    onSuccess: async () => {
      setStatusMessage("Workspace deleted.");
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["account-workspaces"] });
      await queryClient.invalidateQueries({ queryKey: ["account-sources"] });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete workspace");
      setStatusMessage(null);
    },
  });

  const deleteSourceMutation = useMutation({
    mutationFn: deleteSource,
    onSuccess: async () => {
      setStatusMessage("Source deleted.");
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["account-sources"] });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete source");
      setStatusMessage(null);
    },
  });

  const deletionRequestMutation = useMutation({
    mutationFn: () => submitAccountDeletionRequest(deletionNotes),
    onSuccess: () => {
      setStatusMessage("Account deletion request submitted. Our team will follow up by email.");
      setErrorMessage(null);
      setDeletionNotes("");
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to submit deletion request");
      setStatusMessage(null);
    },
  });

  const personalWorkspaces = workspaces.filter(
    (w: NotebookSummary) => w.workspaceType === "personal_learner",
  );

  // Group uploaded sources by notebook.
  const groupedSources = useMemo(() => {
    const groups = new Map<string, { title: string; items: AccountSourceSummary[] }>();
    for (const source of sources) {
      const existing = groups.get(source.notebookId);
      if (existing) {
        existing.items.push(source);
      } else {
        groups.set(source.notebookId, { title: source.notebookTitle, items: [source] });
      }
    }
    return Array.from(groups.values());
  }, [sources]);

  const displayName = session?.user?.displayName?.trim() || "Your account";
  const emailAddress = session?.user?.email ?? "";
  const entitlements = session?.entitlements;

  return (
    <div>
      {/* Page header */}
      <Reveal>
        <h1 className="font-display text-[clamp(26px,4vw,34px)] font-semibold">
          Account &amp; data
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground">
          Manage your profile, review uploaded sources, and control your personal data.
        </p>
      </Reveal>

      {/* Profile head */}
      <Reveal delay={0.04}>
        <Panel className="mt-7 p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar name={displayName} className="h-14 w-14 text-[18px]" />
              <div className="min-w-0">
                <h2 className="truncate font-display text-[22px] font-semibold leading-tight">
                  {displayName}
                </h2>
                {emailAddress && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-[13.5px] text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> {emailAddress}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {entitlements?.studyAccess && <Badge tone="accent">Study access</Badge>}
              {entitlements?.ingestionAccess && <Badge tone="primary">Ingestion</Badge>}
              {entitlements?.adminAccess && <Badge tone="gold">Admin</Badge>}
              {session?.credits && (
                <Badge tone={session.credits.exhausted ? "danger" : "outline"}>
                  {session.credits.percentRemaining}% credits
                </Badge>
              )}
            </div>
          </div>
        </Panel>
      </Reveal>

      {/* Status / error banners */}
      {statusMessage && (
        <Reveal>
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-[14px] text-foreground shadow-soft">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>{statusMessage}</span>
          </div>
        </Reveal>
      )}
      {(errorMessage || error) && (
        <Reveal>
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[14px] text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {errorMessage ??
                (error instanceof Error ? error.message : "Failed to load workspaces")}
            </span>
          </div>
        </Reveal>
      )}

      {/* Profile */}
      <Reveal delay={0.06}>
        <section className="mt-7">
          <Eyebrow>Profile</Eyebrow>
          <Panel className="mt-3 p-6">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Display name">
                <div className="flex h-10 items-center rounded-lg border border-border bg-surface/60 px-3 text-sm text-foreground">
                  <User className="mr-2 h-4 w-4 text-muted-foreground" />
                  {displayName}
                </div>
              </Field>
              <Field label="Email">
                <div className="flex h-10 items-center rounded-lg border border-border bg-surface/60 px-3 text-sm text-foreground">
                  <Mail className="mr-2 h-4 w-4 text-muted-foreground" />
                  {emailAddress || "—"}
                </div>
              </Field>
            </div>
            <p className="mt-4 text-[12.5px] text-muted-foreground">
              Profile details come from your sign-in identity. Contact support to update your name
              or institution.
            </p>
          </Panel>
        </section>
      </Reveal>

      {/* Your workspaces */}
      <Reveal delay={0.08}>
        <section className="mt-9">
          <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
            <Eyebrow>Your workspaces</Eyebrow>
            {!isLoading && personalWorkspaces.length > 0 && (
              <span className="text-[12px] text-muted-foreground">
                {personalWorkspaces.length} personal
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-2.5">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : workspaces.length === 0 ? (
            <Panel className="flex flex-col items-center px-6 py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent/12 text-accent">
                <BookText className="h-6 w-6" />
              </span>
              <h3 className="mt-4 font-display text-[18px] font-semibold">No workspaces yet</h3>
              <p className="mt-1.5 max-w-sm text-[13.5px] text-muted-foreground">
                Workspaces you create will show up here, where you can manage or remove them.
              </p>
            </Panel>
          ) : (
            <Stagger className="space-y-2.5">
              {workspaces.map((workspace: NotebookSummary) => (
                <StaggerItem key={workspace.id}>
                  <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <FolderOpen className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-display text-[16px] font-medium">
                          {workspace.title}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                          <span>Updated {fmtDate(workspace.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                    {workspace.workspaceType === "personal_learner" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={deleteWorkspaceMutation.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete workspace "${workspace.title}"? This cannot be undone.`,
                            )
                          ) {
                            deleteWorkspaceMutation.mutate(workspace.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </Button>
                    ) : (
                      <Badge tone="outline" className="shrink-0">
                        Managed
                      </Badge>
                    )}
                  </Panel>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </section>
      </Reveal>

      {/* Your sources */}
      <Reveal delay={0.1}>
        <section className="mt-9">
          <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
            <Eyebrow>Your sources</Eyebrow>
            {!sourcesLoading && sources.length > 0 && (
              <span className="text-[12px] text-muted-foreground">{sources.length} uploaded</span>
            )}
          </div>
          {sourcesLoading ? (
            <div className="space-y-2.5">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : sources.length === 0 ? (
            <Panel className="flex flex-col items-center px-6 py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gold/14 text-gold">
                <FileText className="h-6 w-6" />
              </span>
              <h3 className="mt-4 font-display text-[18px] font-semibold">No uploaded sources</h3>
              <p className="mt-1.5 max-w-sm text-[13.5px] text-muted-foreground">
                Sources you add to personal workspaces will appear here, grouped by notebook.
              </p>
            </Panel>
          ) : (
            <div className="space-y-6">
              {groupedSources.map((group) => (
                <div key={group.title}>
                  <h3 className="mb-2 flex items-center gap-1.5 font-display text-[14px] font-semibold text-foreground/80">
                    <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    {group.title}
                  </h3>
                  <Stagger className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
                    {group.items.map((source) => (
                      <StaggerItem key={source.id}>
                        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
                          <div className="flex min-w-0 items-center gap-3">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate text-[14.5px] text-foreground">
                              {source.title}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            disabled={deleteSourceMutation.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete source "${source.title}"? This cannot be undone.`,
                                )
                              ) {
                                deleteSourceMutation.mutate(source.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete source</span>
                          </Button>
                        </div>
                      </StaggerItem>
                    ))}
                  </Stagger>
                </div>
              ))}
            </div>
          )}
        </section>
      </Reveal>

      {/* Danger zone */}
      <Reveal delay={0.12}>
        <section className="mt-9">
          <Eyebrow className="text-destructive">Danger zone</Eyebrow>
          <Panel className="mt-3 border-destructive/30 p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-destructive/12 text-destructive">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-[18px] font-semibold">Request account deletion</h3>
                <p className="mt-1.5 max-w-2xl text-[13.5px] text-muted-foreground">
                  Full account deletion spans identity, database records, uploaded files, and
                  analytics systems. Submit a request and we will process it manually during beta.
                </p>
              </div>
            </div>
            <div className="mt-5">
              <Field label="Notes (optional)">
                <Textarea
                  value={deletionNotes}
                  onChange={(event) => setDeletionNotes(event.target.value)}
                  rows={4}
                  placeholder="Tell us anything we should know before deleting your account."
                  data-ph-mask
                />
              </Field>
            </div>
            <div className="mt-5 flex justify-end">
              <Button
                variant="danger"
                disabled={deletionRequestMutation.isPending}
                onClick={() => deletionRequestMutation.mutate()}
              >
                <Trash2 className="h-4 w-4" />
                {deletionRequestMutation.isPending ? "Submitting…" : "Request account deletion"}
              </Button>
            </div>
          </Panel>
        </section>
      </Reveal>
    </div>
  );
}
