/**
 * What a scanned (or typed) code means. QR labels printed by the shop encode
 * absolute URLs — …/items/TL-0001 for an item, …?loc=<uuid> for a location —
 * so the phone's own camera opens them too. Read the meaning out of the
 * path, not the origin, so labels survive a domain change.
 */

export type ScanResult =
  | { kind: 'item'; label: string }
  | { kind: 'location'; id: string }
  | { kind: 'barcode'; code: string }
  | { kind: 'text'; text: string };

const LABEL = /^([A-Z]{2,4})-(\d{4,})$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseScan(raw: string): ScanResult {
  const text = raw.trim();

  const itemInUrl = text.match(/\/items\/([A-Z]{2,4}-\d{4,})(?:[/?#]|$)/i);
  if (itemInUrl) return { kind: 'item', label: itemInUrl[1].toUpperCase() };

  const locInUrl = text.match(/[?&]loc=([0-9a-f-]{36})(?:[&#]|$)/i);
  if (locInUrl && UUID.test(locInUrl[1])) return { kind: 'location', id: locInUrl[1].toLowerCase() };

  if (LABEL.test(text)) return { kind: 'item', label: text.toUpperCase() };

  // UPC-A/E, EAN-8/13, ITF-14 are all digits.
  const digits = text.replace(/[\s-]/g, '');
  if (/^\d{8,14}$/.test(digits)) return { kind: 'barcode', code: digits };

  return { kind: 'text', text };
}

/** UPC-A is EAN-13 with a leading zero; compare them as the same product. */
export function sameBarcode(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.replace(/\D/g, '').replace(/^0+/, '');
  return norm(a) !== '' && norm(a) === norm(b);
}
