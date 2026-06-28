import { Link } from "@tanstack/react-router";

export function JournalLandingPage() {
  return (
    <section>
      <p>
        <small>Interim journal landing (chrome module)</small>
      </p>
      <h1>Your personal study environment</h1>
      <p>
        Tutor, study map, and evidence from real material. Folio tokens and visuals live only in{" "}
        <code>frontend-examples/folio/design-lab/</code>.
      </p>
      <p>
        <Link to="/login">Start studying</Link> · <Link to="/demo">View demo</Link>
      </p>
      <div className="folio-placeholder">
        Production routes are unstyled scaffolds until design tokens are promoted from the design
        lab.
      </div>
    </section>
  );
}
