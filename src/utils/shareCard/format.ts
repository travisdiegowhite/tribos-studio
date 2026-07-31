/**
 * Card-specific pure text formatters for the activity share card.
 */

/** "4h 12m" / "58m" / "45s" — compact duration for the big stat tile. */
export function formatCardDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.round(seconds)}s`;
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "SAT · JUL 26 2026" — field-guide date line under the activity name. */
export function formatCardDate(startDateLocal: string | null | undefined): string {
  if (!startDateLocal) return '';
  const d = new Date(startDateLocal);
  if (Number.isNaN(d.getTime())) return '';
  return `${WEEKDAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
}

/**
 * Truncate text with an ellipsis so it fits within maxWidth_px for the
 * canvas context's CURRENT font. Binary-search on measureText.
 */
export function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth_px: number,
): string {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth_px) return text;

  const ellipsis = '…';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid).trimEnd() + ellipsis).width <= maxWidth_px) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo > 0 ? text.slice(0, lo).trimEnd() + ellipsis : ellipsis;
}

/**
 * Split a formatted stat like "42.3 km" / "1,204 ft" into value and unit so
 * the renderer can draw them at different sizes. Falls back to unit-less.
 */
export function splitValueUnit(formatted: string | null | undefined): { value: string; unit: string } {
  if (!formatted) return { value: '—', unit: '' };
  const trimmed = String(formatted).trim();
  const idx = trimmed.lastIndexOf(' ');
  if (idx > 0 && /^[a-zA-Z/%°]+$/.test(trimmed.slice(idx + 1))) {
    return { value: trimmed.slice(0, idx), unit: trimmed.slice(idx + 1) };
  }
  // Handle suffixes with no space, e.g. "830m" from default formatters.
  const match = trimmed.match(/^([\d.,:]+)\s*([a-zA-Z/%°]+)$/);
  if (match) return { value: match[1], unit: match[2] };
  return { value: trimmed, unit: '' };
}
