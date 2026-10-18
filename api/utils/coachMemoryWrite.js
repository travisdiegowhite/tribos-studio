/**
 * The one way a coach memory is written.
 *
 * Two problems this exists to fix:
 *   - Long memories never expired, so "Run/Bike race on June 20th" was still in
 *     the coach's prompt in October. A memory tied to a dated event now carries
 *     `until` (the event date) and expires the day after it.
 *   - The same goal was saved twice in four days. An insert is skipped when an
 *     active, unexpired memory with identical content already exists.
 *
 * Callers pass the shared admin client — never create one here.
 */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/**
 * @param {{ memory_type?: string, until?: string|null }} memory
 * @param {Date} [now]
 * @returns {string|null} ISO timestamp, or null for a memory that never expires
 */
export function memoryExpiresAt(memory, now = new Date()) {
  const until = typeof memory?.until === 'string' ? memory.until.slice(0, 10) : null;
  if (until && YMD_RE.test(until)) {
    // Through the end of the event day, with a day of slack for timezones.
    return new Date(Date.parse(`${until}T00:00:00Z`) + 2 * DAY_MS).toISOString();
  }
  if (memory?.memory_type === 'short') return new Date(now.getTime() + 7 * DAY_MS).toISOString();
  if (memory?.memory_type === 'medium') return new Date(now.getTime() + 30 * DAY_MS).toISOString();
  return null;
}

function normalise(content) {
  return String(content ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * @param {object} supabase  shared admin client
 * @param {string} userId    verified athlete id
 * @param {{ memory_type: string, category: string, content: string, until?: string|null }} memory
 * @param {{ sourceType?: string, now?: Date }} [opts]
 * @returns {Promise<{ saved: boolean, duplicate?: boolean, error?: object }>}
 */
export async function saveCoachMemory(supabase, userId, memory, opts = {}) {
  const { sourceType = 'conversation', now = new Date() } = opts;
  const content = String(memory?.content ?? '').trim();
  if (!userId || !content) return { saved: false };

  const { data: existing } = await supabase
    .from('coach_memory')
    .select('id, content')
    .eq('user_id', userId)
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`);
  const key = normalise(content);
  if ((existing || []).some((m) => normalise(m.content) === key)) {
    return { saved: false, duplicate: true };
  }

  const { error } = await supabase.from('coach_memory').insert({
    user_id: userId,
    memory_type: memory.memory_type,
    category: memory.category,
    content,
    source_type: sourceType,
    expires_at: memoryExpiresAt(memory, now),
  });
  return error ? { saved: false, error } : { saved: true };
}
