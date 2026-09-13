// Browser-side onboarding bookkeeping (localStorage, per user). The
// database column user_profiles.onboarding_completed is the source of truth
// for "finished"; these keys only decide whether to SHOW the wizard again in
// this browser.
//
// The seen flag is written when the athlete finishes or explicitly skips
// the wizard — never before it opens. It used to be written first, which
// meant a reload mid-wizard silently retired it forever in that browser.

const SEEN_PREFIX = 'tribos_welcome_seen_';

export function hasSeenOnboarding(userId) {
  if (!userId) return false;
  try {
    return localStorage.getItem(`${SEEN_PREFIX}${userId}`) === 'true';
  } catch {
    return false;
  }
}

export function markOnboardingSeen(userId) {
  if (!userId) return;
  try {
    localStorage.setItem(`${SEEN_PREFIX}${userId}`, 'true');
  } catch {
    // Storage unavailable (privacy mode): the wizard may show again next
    // visit, which beats never showing it at all.
  }
}

// ---------------------------------------------------------------------------
// Wizard draft — survives the device-connect OAuth round trip.
//
// The wizard's "Connect Your Device" screen leaves the page entirely
// (window.location.href to the provider), which unmounts the modal and all
// of its useState. The draft is written just before that navigation and
// read by the modal when it next mounts, so the athlete resumes at the
// connect screen with the provider showing as connected instead of being
// dropped on Settings with the persona questions, FTP and the coach's
// opening message all skipped.
//
// The draft is ALSO the routing signal: an OAuth callback that finds one
// sends the athlete back to /today (where LifecycleOverlays reopens the
// wizard) instead of Settings. That is deliberately separate from
// utils/returnTo.js, whose stash is consumed by the public-route redirects
// and would be hijacked by a stale guest-builder value.

const DRAFT_PREFIX = 'tribos_onboarding_draft_';
export const DRAFT_VERSION = 1;
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function draftKey(userId) {
  return `${DRAFT_PREFIX}${userId}`;
}

/**
 * @param {string} userId
 * @param {object} draft  wizard state to resume from (see OnboardingModal)
 */
export function writeOnboardingDraft(userId, draft) {
  if (!userId) return;
  try {
    localStorage.setItem(
      draftKey(userId),
      JSON.stringify({ ...draft, v: DRAFT_VERSION, savedAt: new Date().toISOString() }),
    );
  } catch {
    // Storage unavailable: the round trip falls back to today's behaviour
    // (Settings, wizard not resumed).
  }
}

/**
 * Returns the draft, or null when there is none, it is from another
 * version, or it is older than DRAFT_MAX_AGE_MS (a draft from last month is
 * a stale intent, not a resume).
 */
export function readOnboardingDraft(userId, now = new Date()) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || draft.v !== DRAFT_VERSION) return null;
    const savedAt = new Date(draft.savedAt).getTime();
    if (Number.isNaN(savedAt) || now.getTime() - savedAt > DRAFT_MAX_AGE_MS) return null;
    return draft;
  } catch {
    return null;
  }
}

export function hasOnboardingDraft(userId) {
  return readOnboardingDraft(userId) !== null;
}

export function clearOnboardingDraft(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    // ignore
  }
}
