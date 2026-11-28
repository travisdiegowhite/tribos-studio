/**
 * Route tags ("collections" in the route library). Stored in routes.tags
 * (TEXT[]); one route can sit in several collections.
 *
 * Normalised on every write: trimmed, inner whitespace collapsed, at most
 * MAX_TAG_LENGTH characters, de-duplicated case-insensitively (the first
 * spelling wins), at most MAX_TAGS per route. Anything that isn't a string is
 * dropped.
 */
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 32;

export function normalizeRouteTags(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const tag = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}
