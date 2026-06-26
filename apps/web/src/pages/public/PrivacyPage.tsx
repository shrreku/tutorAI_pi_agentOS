import { PublicLayout } from "./PublicLayout.js";

export function PrivacyPage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <PublicLayout navigate={navigate}>
      <div className="tb-card">
        <h1>Privacy</h1>
        <p>
          TutorBook collects account information, study activity, identified product analytics,
          optional privacy-masked workspace replay, and feedback to operate and improve the beta.
          Uploaded sources are private to the learner workspace but are processed by contracted
          authentication, storage, parsing, analytics, monitoring, and AI providers. Ordinary
          analytics events exclude source text, tutor transcripts, uploaded file contents, and
          private mastery detail. You can delete private sources and workspaces or request full
          account deletion.
        </p>
      </div>
    </PublicLayout>
  );
}
