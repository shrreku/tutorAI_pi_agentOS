import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a 0–1 or 0–100 number as a percent string. */
export function pct(value: number): string {
  const v = value <= 1 ? value * 100 : value;
  return `${Math.round(v)}%`;
}

/** Relative "time ago" from an ISO string, best-effort and dependency-free. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const secondsSource = (Date.now() - then) / 1000;
  const seconds = Math.max(0, secondsSource);
  const units: Array<[number, string]> = [
    [60, "s"],
    [60, "m"],
    [24, "h"],
    [7, "d"],
    [4.345, "w"],
    [12, "mo"],
    [Number.POSITIVE_INFINITY, "y"],
  ];
  let value = seconds;
  let unit = "s";
  for (const [step, label] of units) {
    if (value < step) {
      unit = label;
      break;
    }
    value = value / step;
    unit = label;
  }
  return `${Math.round(value)}${unit} ago`;
}
