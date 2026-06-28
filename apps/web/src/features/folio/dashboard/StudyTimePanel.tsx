import { useState } from "react";
import type { DashboardStudyTime } from "@studyagent/schemas";

/** Preview data until F18 study-time aggregation API ships. */
export const mockStudyTimeWeekBars = [
  { d: "M", v: 40 },
  { d: "T", v: 72 },
  { d: "W", v: 26 },
  { d: "T", v: 91 },
  { d: "F", v: 55 },
  { d: "S", v: 18 },
  { d: "S", v: 63 },
] as const;

export const mockStudyTimeMonthDays = [
  { day: 1, v: 42 },
  { day: 2, v: 68 },
  { day: 3, v: 0 },
  { day: 4, v: 55 },
  { day: 5, v: 91 },
  { day: 6, v: 24 },
  { day: 7, v: 38 },
  { day: 8, v: 72 },
  { day: 9, v: 45 },
  { day: 10, v: 0 },
  { day: 11, v: 58 },
  { day: 12, v: 83 },
  { day: 13, v: 31 },
  { day: 14, v: 66 },
  { day: 15, v: 49 },
  { day: 16, v: 0 },
  { day: 17, v: 77 },
  { day: 18, v: 52 },
  { day: 19, v: 96 },
  { day: 20, v: 44 },
  { day: 21, v: 28 },
  { day: 22, v: 61 },
  { day: 23, v: 0 },
  { day: 24, v: 35 },
  { day: 25, v: 48 },
  { day: 26, v: 70 },
  { day: 27, v: 22 },
  { day: 28, v: 54 },
] as const;

export const mockStudyTimeAggregate = {
  week: { totalMinutes: 260, activeDays: 6 },
  month: { totalMinutes: 1120, activeDays: 22 },
} satisfies {
  week: { totalMinutes: number; activeDays: number };
  month: { totalMinutes: number; activeDays: number };
};

export function resolveStudyTimeDisplay(studyTime: DashboardStudyTime): {
  source: "api" | "mock";
  week: { totalMinutes: number; activeDays: number };
  month: { totalMinutes: number; activeDays: number };
  weekBars: typeof mockStudyTimeWeekBars;
  monthDays: typeof mockStudyTimeMonthDays;
} {
  if (studyTime.status === "ready" && studyTime.week && studyTime.month) {
    return {
      source: "api",
      week: studyTime.week,
      month: studyTime.month,
      weekBars: mockStudyTimeWeekBars,
      monthDays: mockStudyTimeMonthDays,
    };
  }

  return {
    source: "mock",
    week: mockStudyTimeAggregate.week,
    month: mockStudyTimeAggregate.month,
    weekBars: mockStudyTimeWeekBars,
    monthDays: mockStudyTimeMonthDays,
  };
}

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function WeekActivityBars({ week }: { week: typeof mockStudyTimeWeekBars }) {
  const max = Math.max(...week.map((b) => b.v), 1);
  const total = week.reduce((sum, b) => sum + b.v, 0);
  const peak = week.reduce((best, b) => (b.v > best.v ? b : best), week[0]!);

  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: 88 }}>
        {week.map((b, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t-sm bg-accent transition-all"
              style={{ height: `${(b.v / max) * 100}%`, minHeight: 4 }}
            />
            <span className="font-mono text-[10px] text-muted-foreground">{b.d}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        {formatDuration(total)} studied · peak {peak.d}
      </p>
    </div>
  );
}

function MonthActivityTiles({ days }: { days: typeof mockStudyTimeMonthDays }) {
  const max = Math.max(...days.map((d) => d.v), 1);
  const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"] as const;
  const monthLabel = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const total = days.reduce((sum, d) => sum + d.v, 0);
  const best = days.reduce((bestDay, d) => (d.v > bestDay.v ? d : bestDay), days[0]!);

  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {monthLabel}
      </p>
      <div className="grid grid-cols-7 gap-1">
        {weekdayLabels.map((label, i) => (
          <span
            key={`${label}-${i}`}
            className="pb-0.5 text-center font-mono text-[9px] uppercase text-muted-foreground"
          >
            {label}
          </span>
        ))}
        {days.map((day) => {
          const shade = day.v === 0 ? 0 : 18 + (day.v / max) * 62;
          return (
            <div
              key={day.day}
              className="aspect-square rounded-[3px] border border-border/60"
              style={{
                background:
                  day.v === 0
                    ? "color-mix(in oklab, var(--muted) 40%, var(--card))"
                    : `color-mix(in oklab, var(--accent) ${shade}%, var(--card))`,
              }}
              title={`Day ${day.day}: ${day.v} min`}
            >
              <span className="flex h-full items-end justify-end p-0.5 font-mono text-[8px] tabular-nums text-foreground/50">
                {day.day}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        {formatDuration(total)} this month · best day {best.day}
      </p>
    </div>
  );
}

export function StudyTimePanel({ studyTime }: { studyTime: DashboardStudyTime }) {
  const [mode, setMode] = useState<"week" | "month">("week");
  const display = resolveStudyTimeDisplay(studyTime);
  const aggregate = mode === "week" ? display.week : display.month;
  const hours = Math.floor(aggregate.totalMinutes / 60);
  const minutes = aggregate.totalMinutes % 60;

  return (
    <div className="mt-3 border border-border bg-card/50 px-4 py-3">
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-2">
        <div className="flex gap-4">
          {(["week", "month"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={
                "font-mono text-[11px] uppercase tracking-wider " +
                (mode === m
                  ? "font-semibold text-accent"
                  : "text-muted-foreground hover:text-foreground")
              }
              onClick={() => setMode(m)}
            >
              {m === "week" ? "This week" : "This month"}
            </button>
          ))}
        </div>
        {display.source === "mock" ? (
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            Preview
          </span>
        ) : null}
      </div>
      <p className="font-display text-[28px] font-semibold tabular-nums">
        {hours}h {minutes}m
      </p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
        {aggregate.activeDays} active day{aggregate.activeDays === 1 ? "" : "s"}
      </p>
      <div className="mt-4">
        {mode === "week" ? (
          <WeekActivityBars week={display.weekBars} />
        ) : (
          <MonthActivityTiles days={display.monthDays} />
        )}
      </div>
    </div>
  );
}
