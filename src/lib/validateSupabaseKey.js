/**
 * Classify a Supabase API key and decide whether it is safe to hand to a browser.
 *
 * Supabase has two key formats in circulation:
 *
 *   • Legacy JWTs — `eyJ…`, three dot-separated base64url segments, with the
 *     privilege level readable from the payload's `role` claim
 *     (`anon` | `service_role`).
 *   • Current opaque keys — `sb_publishable_…` (browser-safe) and
 *     `sb_secret_…` (server-only). These are NOT JWTs: no dots, nothing to
 *     decode. The privilege level is carried entirely by the prefix.
 *
 * The previous inline check assumed the JWT shape unconditionally
 * (`atob(key.split('.')[1])`), so every `sb_*` key threw inside the decoder and
 * was reported as "failed to validate" — meaning an `sb_secret_…` key pasted
 * into VITE_SUPABASE_ANON_KEY would NOT have been recognised as dangerous.
 *
 * Kept deliberately pure and side-effect free: `src/test/setup.ts` mocks
 * `src/lib/supabase`, so the validation can only be unit-tested from a module
 * that does not create a client.
 */

const PUBLISHABLE_PREFIX = 'sb_publishable_';
const SECRET_PREFIX = 'sb_secret_';

/** Thrown when a key must never reach the browser. Fail closed on this. */
export class UnsafeSupabaseKeyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeSupabaseKeyError';
  }
}

/** base64url → string. `atob` alone mishandles `-`/`_` and missing padding. */
function decodeBase64Url(segment) {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
}

/**
 * @param {string} key
 * @returns {{format: 'missing'|'secret'|'publishable'|'jwt'|'unknown',
 *            role: string|null, browserSafe: boolean, certain: boolean}}
 *   `certain` distinguishes "known to be fine" from "could not determine" —
 *   only the former should pass silently.
 */
export function inspectSupabaseKey(key) {
  if (!key || key === 'placeholder-key') {
    return { format: 'missing', role: null, browserSafe: false, certain: true };
  }

  if (key.startsWith(SECRET_PREFIX)) {
    return { format: 'secret', role: 'service_role', browserSafe: false, certain: true };
  }
  if (key.startsWith(PUBLISHABLE_PREFIX)) {
    return { format: 'publishable', role: 'anon', browserSafe: true, certain: true };
  }

  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const role = JSON.parse(decodeBase64Url(parts[1]))?.role ?? null;
      if (role === 'service_role') {
        return { format: 'jwt', role, browserSafe: false, certain: true };
      }
      return { format: 'jwt', role, browserSafe: true, certain: role === 'anon' };
    } catch {
      // Shaped like a JWT but undecodable. Treat as indeterminate rather than
      // safe-by-default silence.
      return { format: 'jwt', role: null, browserSafe: true, certain: false };
    }
  }

  return { format: 'unknown', role: null, browserSafe: true, certain: false };
}

/**
 * Throws when the key is definitely privileged. Returns the inspection result
 * otherwise, warning when the key could not be positively identified.
 *
 * Only throws when we are CERTAIN — an unrecognised future key format should
 * not brick the app, but it should be loud.
 *
 * @throws {UnsafeSupabaseKeyError}
 */
export function assertBrowserSafeKey(key) {
  const info = inspectSupabaseKey(key);

  if (info.format === 'missing') {
    console.error('❌ VITE_SUPABASE_ANON_KEY is not configured');
    return info;
  }

  if (!info.browserSafe) {
    const which = info.format === 'secret' ? 'sb_secret_ key' : 'service_role JWT';
    throw new UnsafeSupabaseKeyError(
      `Refusing to start: VITE_SUPABASE_ANON_KEY is a ${which}. ` +
        'It bypasses row-level security and must never reach a browser. ' +
        'Use the publishable (anon) key instead.',
    );
  }

  if (!info.certain) {
    console.warn(
      `⚠️ Could not positively identify VITE_SUPABASE_ANON_KEY (format: ${info.format}). ` +
        'Verify it is the publishable/anon key, not a secret one.',
    );
  }

  return info;
}
