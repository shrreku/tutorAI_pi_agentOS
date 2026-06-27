export type SurfaceMode = "study_map" | "curriculum" | "source_wiki_map";

const MODES: Array<{ id: SurfaceMode; label: string }> = [
  { id: "study_map", label: "Study Map" },
  { id: "curriculum", label: "Curriculum" },
  { id: "source_wiki_map", label: "Source Wiki" },
];

export function SurfaceSwitcher({
  value,
  onChange,
}: {
  value: SurfaceMode;
  onChange: (mode: SurfaceMode) => void;
}) {
  return (
    <div className="surface-switch" data-surface>
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className={value === mode.id ? "active" : undefined}
          onClick={() => onChange(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
