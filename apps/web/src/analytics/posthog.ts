export async function initPostHog(_policy: {
  enabled: boolean;
  sampleRate: number;
  disabledUntil: string | null;
}): Promise<void> {
  /* analytics optional in local dev */
}

export function identifyPostHogUser(_userId: string, _traits: Record<string, string>): void {
  /* analytics optional in local dev */
}
