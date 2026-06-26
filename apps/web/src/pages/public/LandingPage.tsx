import { PublicLayout } from "./PublicLayout.js";

export function LandingPage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <PublicLayout navigate={navigate}>
      <section className="tb-hero">
        <div className="tb-brand">TutorBook</div>
        <h1>Study with a tutor that knows your material.</h1>
        <p className="tb-lead">
          TutorBook helps you learn from real sources with guided tutoring, a study map, and
          evidence-backed answers. Start from ready-made study templates or bring your own material
          in the beta.
        </p>
        <div className="tb-actions">
          <button
            type="button"
            className="tb-button tb-button-primary"
            onClick={() => navigate("/login")}
          >
            Start studying
          </button>
          <button type="button" className="tb-button" onClick={() => navigate("/demo")}>
            View demo
          </button>
        </div>
      </section>
    </PublicLayout>
  );
}
