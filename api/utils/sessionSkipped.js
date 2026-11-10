/**
 * Was this planned session deliberately skipped?
 *
 * `calendar_entries.status = 'skipped'` is the truth, but a skip may carry no
 * reason, and some readers hand back only `skipped_reason`. Checking the
 * reason alone filed every reason-less skip as MISSED, so read both.
 *
 * Shared by the browser (`src/`) and the server (`api/`), like entrySport.js.
 */
export function isSkippedSession(session) {
  if (!session) return false;
  return session.status === 'skipped' || Boolean(session.skipped_reason);
}
