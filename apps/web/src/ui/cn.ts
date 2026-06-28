import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function pct(value: number): string {
  const v = value <= 1 ? value * 100 : value;
  return `${Math.round(v)}%`;
}
