import { posthog as posthogJs } from "posthog-js";

// Study workspace text may contain source content, tutor transcripts, notes,
// feedback, or learner state. Keep replay private-by-default and use it for
// layout/interaction diagnosis rather than capturing study text.
const REPLAY_MASK_SELECTORS = "*";

type PostHogClient = {
  init: (apiKey: string, options: Record<string, unknown>) => void;
  identify: (distinctId: string, properties?: Record<string, unknown>) => void;
  reset: () => void;
};

export type ReplayPolicy = {
  enabled: boolean;
  sampleRate: number;
  disabledUntil: string | null;
};

let posthogClient: PostHogClient | null = null;
let posthogInitialized = false;

export function getPostHogReplayMaskSelectors(): string {
  return REPLAY_MASK_SELECTORS;
}

export function shouldEnableReplay(policy: ReplayPolicy, randomValue = Math.random()): boolean {
  if (!policy.enabled) return false;
  if (policy.disabledUntil && new Date(policy.disabledUntil).getTime() > Date.now()) return false;
  const sampleRate = Math.max(0, Math.min(1, policy.sampleRate));
  return randomValue < sampleRate;
}

export async function initPostHog(
  replayPolicy: ReplayPolicy,
  options?: { client?: PostHogClient },
): Promise<void> {
  const apiKey = import.meta.env.VITE_POSTHOG_API_KEY?.trim();
  if (!apiKey || posthogInitialized) {
    return;
  }

  const replayEnabled = shouldEnableReplay(replayPolicy);
  const posthog = options?.client ?? posthogJs;

  posthog.init(apiKey, {
    api_host: import.meta.env.VITE_POSTHOG_HOST?.trim() || "https://us.i.posthog.com",
    autocapture: false,
    // First-party Product Analytics Events are canonical; do not create a
    // second browser-only page-view dataset in PostHog.
    capture_pageview: false,
    persistence: "localStorage+cookie",
    disable_session_recording: !replayEnabled,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: REPLAY_MASK_SELECTORS,
    },
  });

  posthogClient = posthog;
  posthogInitialized = true;
}

export function identifyPostHogUser(
  userId: string,
  properties?: { email?: string; name?: string },
): void {
  if (!posthogClient) return;
  posthogClient.identify(userId, {
    ...(properties?.email ? { email: properties.email } : {}),
    ...(properties?.name ? { name: properties.name } : {}),
  });
}

export function resetPostHogForTests(): void {
  posthogInitialized = false;
  posthogClient = null;
}
