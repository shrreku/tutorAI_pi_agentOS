import { useState } from "react";
import { api } from "../../routing/api.js";
import { AdminLoadingState, AdminTable, useAdminFetch } from "./adminShared.js";

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
    <div className="tb-card">
      <h1>Templates</h1>
      <p>Published and draft study templates.</p>
      <AdminLoadingState loading={loading} error={error} />
      {formError && <p className="tb-error">{formError}</p>}
      <form
        className="tb-form"
        onSubmit={(event) => {
          event.preventDefault();
          void createTemplate();
        }}
      >
        <h2>Create template</h2>
        <label>
          Title
          <input
            className="tb-input"
            value={createForm.title}
            onChange={(event) => updateCreateForm("title", event.target.value)}
            required
          />
        </label>
        <label>
          Slug
          <input
            className="tb-input"
            value={createForm.slug}
            onChange={(event) => updateCreateForm("slug", event.target.value)}
            required
          />
        </label>
        <label>
          Topic
          <input
            className="tb-input"
            value={createForm.topic}
            onChange={(event) => updateCreateForm("topic", event.target.value)}
            required
          />
        </label>
        <label>
          Source level
          <input
            className="tb-input"
            value={createForm.sourceLevel}
            onChange={(event) => updateCreateForm("sourceLevel", event.target.value)}
            required
          />
        </label>
        <label>
          Estimated minutes
          <input
            className="tb-input"
            type="number"
            min="1"
            value={createForm.estimatedMinutes}
            onChange={(event) => updateCreateForm("estimatedMinutes", event.target.value)}
            required
          />
        </label>
        <label>
          Study mode
          <input
            className="tb-input"
            value={createForm.studyMode}
            onChange={(event) => updateCreateForm("studyMode", event.target.value)}
            required
          />
        </label>
        <label>
          Expected outcome
          <input
            className="tb-input"
            value={createForm.expectedOutcome}
            onChange={(event) => updateCreateForm("expectedOutcome", event.target.value)}
            required
          />
        </label>
        <label>
          Source notebook ID
          <input
            className="tb-input"
            value={createForm.notebookId}
            onChange={(event) => updateCreateForm("notebookId", event.target.value)}
            required
          />
        </label>
        <label>
          Sort order
          <input
            className="tb-input"
            type="number"
            value={createForm.sortOrder}
            onChange={(event) => updateCreateForm("sortOrder", event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="tb-button tb-button-primary"
          disabled={busyId === "create"}
        >
          Create draft template
        </button>
      </form>
      {data ? (
        <AdminTable>
          <thead>
            <tr>
              <th>Title</th>
              <th>Slug</th>
              <th>Topic</th>
              <th>Status</th>
              <th>Readiness</th>
              <th>Source rights</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.templates.map((template) => {
              const readinessStatus =
                typeof template.readinessJson?.status === "string"
                  ? template.readinessJson.status
                  : "pending";
              const sourceRightsStatus =
                typeof template.sourceRightsJson?.status === "string"
                  ? template.sourceRightsJson.status
                  : "pending";
              const requiresAccessGrant = template.readinessJson?.requiresAccessGrant === true;
              return (
                <tr key={template.id}>
                  <td>{template.title}</td>
                  <td>{template.slug}</td>
                  <td>{template.topic}</td>
                  <td>{template.status}</td>
                  <td>{readinessStatus}</td>
                  <td>{sourceRightsStatus}</td>
                  <td className="tb-admin-actions">
                    <button
                      type="button"
                      disabled={busyId === template.id}
                      onClick={() =>
                        void patchTemplate(template.id, {
                          status: template.status === "published" ? "draft" : "published",
                          readinessJson: { status: "ready" },
                          sourceRightsJson: { status: "reviewed" },
                        })
                      }
                    >
                      {template.status === "published" ? "Set draft" : "Publish"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === template.id}
                      onClick={() =>
                        void patchTemplate(template.id, {
                          readinessJson: {
                            status: readinessStatus === "ready" ? "pending" : "ready",
                          },
                        })
                      }
                    >
                      Toggle readiness
                    </button>
                    <button
                      type="button"
                      disabled={busyId === template.id}
                      onClick={() =>
                        void patchTemplate(template.id, {
                          sourceRightsJson: {
                            status: sourceRightsStatus === "reviewed" ? "pending" : "reviewed",
                          },
                        })
                      }
                    >
                      Toggle source rights
                    </button>
                    <button
                      type="button"
                      disabled={busyId === template.id}
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
                      {requiresAccessGrant ? "Make generally available" : "Require template grant"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </AdminTable>
      ) : null}
    </div>
  );
}
