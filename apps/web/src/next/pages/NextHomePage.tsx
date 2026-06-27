import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from "@studyagent/ui";
import { useVisualTheme } from "../shell/ThemeProvider.js";

export function NextHomePage({ navigate }: { navigate: (path: string) => void }) {
  const theme = useVisualTheme();

  return (
    <div className={`home-page home-page--${theme} min-h-screen bg-background`}>
      <header className="home-header mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="home-brand flex items-center gap-2">
          <span className="home-logo flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
            TB
          </span>
          <span className="home-title font-display text-lg font-semibold">TutorBook</span>
        </div>
        <Button type="button" onClick={() => navigate("/login")}>
          Sign in
        </Button>
      </header>

      <main className="home-main mx-auto max-w-3xl px-6 pb-20 pt-8">
        <div className="home-copy">
          <Badge variant="purple" className="home-theme-badge mb-4">
            {theme} theme
          </Badge>
          <h1 className="home-heading font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Notebook-scoped learning with a tutor that shows its work
          </h1>
          <p className="home-lede mt-4 max-w-2xl font-reading text-lg leading-relaxed text-muted-foreground">
            Study Map, Source Wiki, Evidence, and live tutor sessions, one workspace per notebook.
            Flip themes in the dev switcher to compare Mist Glass, Folio, and Focus.
          </p>
          <div className="home-actions mt-8 flex flex-wrap gap-3">
            <Button type="button" onClick={() => navigate("/app")}>
              Open dashboard
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate("/login")}>
              Login
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate("/notebooks")}>
              Notebooks
            </Button>
          </div>
        </div>

        <div className="home-feature-grid mt-12 grid gap-4 sm:grid-cols-3">
          {[
            { title: "Study Map", desc: "Graph navigation across objectives and concepts" },
            { title: "Tutor chat", desc: "Runtime work view with thinking and tool steps" },
            { title: "Evidence", desc: "Source excerpts that build trust" },
          ].map((item) => (
            <Card key={item.title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
