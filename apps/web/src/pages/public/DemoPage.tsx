import { PublicLayout } from "./PublicLayout.js";

export function DemoPage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <PublicLayout navigate={navigate}>
      <div className="tb-card">
        <h1>Product demo</h1>
        <p>
          TutorBook combines tutoring, source-backed study maps, and evidence links in one
          workspace. Sign in to upload sources or start from a published study template.
        </p>
        <button
          type="button"
          className="tb-button tb-button-primary"
          onClick={() => navigate("/login")}
        >
          Start studying
        </button>
      </div>
    </PublicLayout>
  );
}
