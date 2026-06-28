import { useMemo, useState } from "react";
import { AlertTriangle, FileText, Plus, X } from "lucide-react";
import { api } from "../../routing/api.js";
import {
  AdminEmpty,
  AdminLoadingState,
  AdminPageHeader,
  AdminStat,
  AdminTable,
  AdminTD,
  AdminTH,
  useAdminFetch,
} from "./adminShared.js";
import { Badge, Button, Dot, Field, Input } from "../../ui/primitives.js";
import { Reveal } from "../../ui/motion.js";

type TemplateRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  topic: string;
  readinessJson: Record<string, unknown>;
  sourceRightsJson: Record<string, unknown>;
};

type TemplatesResponse = { templates: TemplateRow[] };

type TemplateCreateForm = {
  slug: string;
  title: string;
  topic: string;
  sourceLevel: string;
  estimatedMinutes: string;
  studyMode: string;
  expectedOutcome: string;
  notebookId: string;
  sortOrder: string;
};

const EMPTY_FORM: TemplateCreateForm = {
  slug: "",
  title: "",
  topic: "",
  sourceLevel: "",
  estimatedMinutes: "45",
  studyMode: "guided",
  expectedOutcome: "",
  notebookId: "",
  sortOrder: "0",
};

export function AdminTemplatesPage() {
  const { data, error, loading, reload } =
    useAdminFetch<TemplatesResponse>("/admin/study-templates");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<TemplateCreateForm>(EMPTY_FORM);
  const [showCreate, setShowCreate] = useState(false);

  const templates = data?.templates ?? [];
  const stats = useMemo(() => {
    const total = templates.length;
    const published = templates.filter((t) => t.status === "published").length;
    const ready = templates.filter(
      (t) => typeof t.readinessJson?.status === "string" && t.readinessJson.status === "ready",
    ).length;
    return { total, published, draft: total - published, ready };
  }, [templates]);

  async function patchTemplate(
    templateId: string,
    body: {
      status?: "draft" | "published";
      readinessJson?: Record<string, unknown>;
      sourceRightsJson?: Record<string, unknown>;
    },
  ) {
    setBusyId(templateId);
    setFormError(null);
    try {
      const res = await api(`/admin/study-templates/${encodeURIComponent(templateId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as { message?: string };
      if (!res.ok) {
        throw new Error(payload.message ?? "Update failed");
      }
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function createTemplate() {
    setBusyId("create");
    setFormError(null);
    try {
      const res = await api("/admin/study-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: createForm.slug.trim(),
          title: createForm.title.trim(),
          topic: createForm.topic.trim(),
          sourceLevel: createForm.sourceLevel.trim(),
          estimatedMinutes: Number.parseInt(createForm.estimatedMinutes, 10),
          studyMode: createForm.studyMode.trim(),
          expectedOutcome: createForm.expectedOutcome.trim(),
          notebookId: createForm.notebookId.trim(),
          sortOrder: Number.parseInt(createForm.sortOrder, 10) || 0,
        }),
      });
      const payload = (await res.json()) as { message?: string };
      if (!res.ok) {
        throw new Error(payload.message ?? "Template creation failed");
      }
      setCreateForm(EMPTY_FORM);
      setShowCreate(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Template creation failed");
    } finally {
      setBusyId(null);
    }
  }

  function updateCreateForm<K extends keyof TemplateCreateForm>(
    key: K,
    value: TemplateCreateForm[K],
  ) {
    setCreateForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <>
      <AdminPageHeader
        title="Study templates"
        description="Curate, publish, and gate the study templates available to learners."
        actions={
          <Button
            variant={showCreate ? "outline" : "primary"}
            onClick={() => {
              setFormError(null);
              setShowCreate((v) => !v);
            }}
          >
            {showCreate ? (
              <>
                <X className="h-4 w-4" />
                Close
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                New template
              </>
            )}
          </Button>
        }
      />

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <AdminStat
            label="Templates"
            value={stats.total}
            icon={<FileText className="h-4 w-4" />}
          />
          <AdminStat label="Published" value={stats.published} hint="Live for learners" />
          <AdminStat label="Drafts" value={stats.draft} hint="Not yet published" />
          <AdminStat label="Ready" value={stats.ready} hint="Readiness marked ready" />
        </div>

        {formError ? (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13.5px] text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        ) : null}

        {showCreate ? (
          <Reveal>
            <form
              className="rounded-xl border border-border bg-card p-6 shadow-soft"
              onSubmit={(event) => {
                event.preventDefault();
                void createTemplate();
              }}
            >
              <h2 className="font-display text-[18px] font-semibold">Create template</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                New templates are created as drafts until published.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Title">
                  <Input
                    value={createForm.title}
                    onChange={(event) => updateCreateForm("title", event.target.value)}
                    required
                  />
                </Field>
                <Field label="Slug">
                  <Input
                    value={createForm.slug}
                    onChange={(event) => updateCreateForm("slug", event.target.value)}
                    required
                  />
                </Field>
                <Field label="Topic">
                  <Input
                    value={createForm.topic}
                    onChange={(event) => updateCreateForm("topic", event.target.value)}
                    required
                  />
                </Field>
                <Field label="Source level">
                  <Input
                    value={createForm.sourceLevel}
                    onChange={(event) => updateCreateForm("sourceLevel", event.target.value)}
                    required
                  />
                </Field>
                <Field label="Estimated minutes">
                  <Input
                    type="number"
                    min="1"
                    value={createForm.estimatedMinutes}
                    onChange={(event) => updateCreateForm("estimatedMinutes", event.target.value)}
                    required
                  />
                </Field>
                <Field label="Study mode">
                  <Input
                    value={createForm.studyMode}
                    onChange={(event) => updateCreateForm("studyMode", event.target.value)}
                    required
                  />
                </Field>
                <Field label="Expected outcome">
                  <Input
                    value={createForm.expectedOutcome}
                    onChange={(event) => updateCreateForm("expectedOutcome", event.target.value)}
                    required
                  />
                </Field>
                <Field label="Source notebook ID">
                  <Input
                    value={createForm.notebookId}
                    onChange={(event) => updateCreateForm("notebookId", event.target.value)}
                    required
                  />
                </Field>
                <Field label="Sort order">
                  <Input
                    type="number"
                    value={createForm.sortOrder}
                    onChange={(event) => updateCreateForm("sortOrder", event.target.value)}
                  />
                </Field>
              </div>
              <div className="mt-6 flex items-center gap-2">
                <Button type="submit" variant="primary" disabled={busyId === "create"}>
                  {busyId === "create" ? "Creating…" : "Create draft template"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowCreate(false);
                    setFormError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Reveal>
        ) : null}

        {loading || error ? (
          <AdminLoadingState loading={loading} error={error} />
        ) : templates.length === 0 ? (
          <AdminEmpty message="No study templates yet. Create your first template to get started." />
        ) : (
          <AdminTable>
            <thead>
              <tr>
                <AdminTH>Template</AdminTH>
                <AdminTH>Topic</AdminTH>
                <AdminTH>Status</AdminTH>
                <AdminTH>Readiness</AdminTH>
                <AdminTH>Source rights</AdminTH>
                <AdminTH className="text-right">Actions</AdminTH>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => {
                const readinessStatus =
                  typeof template.readinessJson?.status === "string"
                    ? template.readinessJson.status
                    : "pending";
                const sourceRightsStatus =
                  typeof template.sourceRightsJson?.status === "string"
                    ? template.sourceRightsJson.status
                    : "pending";
                const requiresAccessGrant = template.readinessJson?.requiresAccessGrant === true;
                const isPublished = template.status === "published";
                const isReady = readinessStatus === "ready";
                const isReviewed = sourceRightsStatus === "reviewed";
                const busy = busyId === template.id;
                return (
                  <tr key={template.id}>
                    <AdminTD>
                      <div className="font-medium text-foreground">{template.title}</div>
                      <div className="mt-0.5 font-mono text-[11.5px] text-muted-foreground">
                        {template.slug}
                      </div>
                    </AdminTD>
                    <AdminTD className="text-muted-foreground">{template.topic}</AdminTD>
                    <AdminTD>
                      <Badge tone={isPublished ? "success" : "neutral"}>
                        <Dot tone={isPublished ? "success" : "neutral"} />
                        {template.status}
                      </Badge>
                    </AdminTD>
                    <AdminTD>
                      <Badge tone={isReady ? "accent" : "warning"}>{readinessStatus}</Badge>
                      {requiresAccessGrant ? (
                        <Badge tone="gold" className="ml-1.5">
                          grant required
                        </Badge>
                      ) : null}
                    </AdminTD>
                    <AdminTD>
                      <Badge tone={isReviewed ? "primary" : "warning"}>{sourceRightsStatus}</Badge>
                    </AdminTD>
                    <AdminTD>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant={isPublished ? "outline" : "primary"}
                          disabled={busy}
                          onClick={() =>
                            void patchTemplate(template.id, {
                              status: isPublished ? "draft" : "published",
                              readinessJson: { status: "ready" },
                              sourceRightsJson: { status: "reviewed" },
                            })
                          }
                        >
                          {isPublished ? "Set draft" : "Publish"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void patchTemplate(template.id, {
                              readinessJson: {
                                status: isReady ? "pending" : "ready",
                              },
                            })
                          }
                        >
                          Toggle readiness
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void patchTemplate(template.id, {
                              sourceRightsJson: {
                                status: isReviewed ? "pending" : "reviewed",
                              },
                            })
                          }
                        >
                          Toggle source rights
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            void patchTemplate(template.id, {
                              readinessJson: {
                                ...template.readinessJson,
                                status: readinessStatus,
                                requiresAccessGrant: !requiresAccessGrant,
                              },
                            })
                          }
                        >
                          {requiresAccessGrant
                            ? "Make generally available"
                            : "Require template grant"}
                        </Button>
                      </div>
                    </AdminTD>
                  </tr>
                );
              })}
            </tbody>
          </AdminTable>
        )}
      </div>
    </>
  );
}
