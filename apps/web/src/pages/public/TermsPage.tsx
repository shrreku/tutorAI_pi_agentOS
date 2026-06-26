import { PublicLayout } from "./PublicLayout.js";

export function TermsPage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <PublicLayout navigate={navigate}>
      <div className="tb-card">
        <h1>Terms</h1>
        <p>
          TutorBook is offered as an experimental beta. Do not use it for high-stakes educational
          decisions. Full terms will be published before general availability.
        </p>
      </div>
    </PublicLayout>
  );
}
