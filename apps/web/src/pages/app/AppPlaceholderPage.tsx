export function AppPlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="tb-card">
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
