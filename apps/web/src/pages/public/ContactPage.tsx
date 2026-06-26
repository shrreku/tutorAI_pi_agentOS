import { PublicLayout } from "./PublicLayout.js";

export function ContactPage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <PublicLayout navigate={navigate}>
      <div className="tb-card">
        <h1>Contact</h1>
        <p>Questions about the TutorBook beta? Reach out at hello@tutorbook.me.</p>
      </div>
    </PublicLayout>
  );
}
