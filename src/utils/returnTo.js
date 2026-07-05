// Post-auth return destination, stashed across the signup/confirmation
// round trip (same localStorage pattern as `tribos_consent_pending`).
// Used by the guest route-builder flow: the guest's in-progress route
// lives in the localStorage-persisted builder store, so landing them back
// at the builder after auth restores exactly where they left off.
//
// Known limitation: if the confirmation link is opened on a different
// device, the session lands there but this stash (and the route) stay in
// the original browser — signing in on the original device recovers both.

const KEY = 'tribos_return_to';

export function stashReturnTo(path) {
  try {
    localStorage.setItem(KEY, path);
  } catch {
    // Storage unavailable (privacy mode) — the user just lands on /today.
  }
}

/**
 * Read the stashed destination without clearing it. Safe to call during
 * render (StrictMode double-renders would lose a consumed value).
 */
export function peekReturnTo() {
  try {
    const value = localStorage.getItem(KEY);
    return value && value.startsWith('/') ? value : null;
  } catch {
    return null;
  }
}

export function clearReturnTo() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Read and clear the stashed destination. Returns null when nothing was
 * stashed or the value isn't an internal path.
 */
export function consumeReturnTo() {
  const value = peekReturnTo();
  clearReturnTo();
  return value;
}
