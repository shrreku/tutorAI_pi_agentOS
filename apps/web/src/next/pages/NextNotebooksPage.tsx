import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@studyagent/ui";
import { fetchNotebooks, fetchStudyTemplates } from "../../routing/api.js";
import { NextProductShell } from "../shell/NextProductShell.js";
import { useVisualTheme } from "../shell/ThemeProvider.js";

export function NextNotebooksPage({ navigate }: { navigate: (path: string) => void }) {
  const theme = useVisualTheme();
  const {
    data: notebooks = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["notebooks"],
    queryFn: fetchNotebooks,
  });
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["study-templates"],
    queryFn: fetchStudyTemplates,
  });

  const personal = notebooks.filter((n) => n.workspaceType === "personal_learner");

  return (
    <NextProductShell navigate={navigate} active="notebooks">
      <div className={`notebooks-page notebooks-page--${theme}`}>
        <div className="notebooks-hero mb-6">
          <h1 className="notebooks-heading font-display text-2xl font-semibold">Notebooks</h1>
          <p className="notebooks-lede text-muted-foreground">
            Open a workspace or start from a published template.
          </p>
        </div>

        <div className="notebooks-grid grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Your workspaces</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {error && (
                <p className="text-sm text-destructive">
                  {error instanceof Error ? error.message : "Error"}
                </p>
              )}
              {!isLoading && personal.length === 0 && (
                <p className="text-sm text-muted-foreground">No personal workspaces yet.</p>
              )}
              {personal.map((notebook) => (
                <div
                  key={notebook.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-4"
                >
                  <div>
                    <div className="font-medium">{notebook.title}</div>
                    <div className="text-xs text-muted-foreground">
                      Updated {new Date(notebook.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => navigate(`/notebooks/${encodeURIComponent(notebook.id)}`)}
                  >
                    Open
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Published templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {templatesLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {templates.map((template) => (
                <div key={template.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-medium">{template.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{template.topic}</p>
                    </div>
                    <Badge variant="secondary">{template.estimatedMinutes}m</Badge>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/app/templates/${encodeURIComponent(template.id)}`)}
                    >
                      Details
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        navigate(`/app/workspaces/new?template=${encodeURIComponent(template.id)}`)
                      }
                    >
                      Start
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </NextProductShell>
  );
}
