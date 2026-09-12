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
