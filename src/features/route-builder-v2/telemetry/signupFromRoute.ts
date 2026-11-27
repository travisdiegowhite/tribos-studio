/**
 * account_created_from_route — the last step of the routing funnel
 * (docs/ROUTING-LANDING-SPEC.md §5). It was defined but never sent.
 *
 * The guest save modal marks the intent before sending the guest to /auth;
 * the builder consumes the mark once a user exists again (the guest comes
 * back to the builder through the stashed return path). Only a NEW account
 * counts: `created_at` within a day, so signing in to an existing account
 * from the modal never fires the event. Auth files are not involved.
 *
 * Known gap (same as returnTo): confirming the email on another device
 * lands the session there, without this mark.
 */
import { trackLanding } from '../../routing-landing/landingTelemetry';

const KEY = 'tribos_signup_from_route';
const MARK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;

interface Mark {
  trigger: string;
  at: number;
}

export function markSignupFromRoute(trigger: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ trigger, at: Date.now() } satisfies Mark));
  } catch {
    // storage unavailable — the event is simply not sent
  }
}

function readMark(): Mark | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Mark>;
    if (typeof parsed?.at !== 'number' || typeof parsed?.trigger !== 'string') return null;
    return { trigger: parsed.trigger, at: parsed.at };
  } catch {
    return null;
  }
}

function clearMark(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Call when a signed-in user is present. Fires the event at most once per
 * mark, and only for an account created in the last day. Clears the mark
 * either way. Returns true when the event was sent.
 */
export function consumeSignupFromRoute(
  user: { created_at?: string | null } | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!user) return false;
  const mark = readMark();
  if (!mark) return false;
  clearMark();
  if (now - mark.at > MARK_TTL_MS) return false;
  const createdAt = user.created_at ? Date.parse(user.created_at) : NaN;
  if (!Number.isFinite(createdAt) || now - createdAt > NEW_ACCOUNT_MS) return false;
  trackLanding('account_created_from_route', { trigger: mark.trigger, surface: 'rb2' });
  return true;
}
