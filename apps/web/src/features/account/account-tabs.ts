import { z } from "zod";

export const accountTabSchema = z.enum([
  "overview",
  "credits",
  "access-code",
  "support",
  "data",
]);

export type AccountTab = z.infer<typeof accountTabSchema>;

export const ACCOUNT_TAB_LABELS: Record<AccountTab, string> = {
  overview: "Overview",
  credits: "Credits",
  "access-code": "Access code",
  support: "Support",
  data: "Data",
};

export function parseAccountTab(value: string): AccountTab {
  return accountTabSchema.parse(value);
}
