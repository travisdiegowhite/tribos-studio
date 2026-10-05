/**
 * Label stock geometry and page layout. Everything is in millimetres; the
 * print view positions each label absolutely on a page of exactly this size,
 * so what prints matches the stock as long as the browser prints at 100%
 * ("Actual size", no "fit to page"). `nudge` absorbs a printer's own offset.
 */

export interface LabelStock {
  id: string;
  name: string;
  /** Page (sheet) size. For a roll this is one label. */
  pageW: number;
  pageH: number;
  cols: number;
  rows: number;
  labelW: number;
  labelH: number;
  /** Distance from the page edge to the first label. */
  marginLeft: number;
  marginTop: number;
  /** Distance from one label's left/top edge to the next one's. */
  pitchX: number;
  pitchY: number;
  /** Draw cut lines (plain paper). */
  cutLines?: boolean;
}

const IN = 25.4;

export const LABEL_STOCKS: LabelStock[] = [
  {
    // The common US address label: 30 per Letter sheet, 3 × 10.
    id: 'avery-5160',
    name: 'Avery 5160 / 8160 — 1 × 2⅝ in, 30 per sheet',
    pageW: 8.5 * IN, pageH: 11 * IN, cols: 3, rows: 10,
    labelW: 2.625 * IN, labelH: 1 * IN,
    marginLeft: 0.1875 * IN, marginTop: 0.5 * IN, pitchX: 2.75 * IN, pitchY: 1 * IN,
  },
  {
    // Shipping label, roomy for bins: 10 per Letter sheet, 2 × 5.
    id: 'avery-5163',
    name: 'Avery 5163 / 8163 — 2 × 4 in, 10 per sheet',
    pageW: 8.5 * IN, pageH: 11 * IN, cols: 2, rows: 5,
    labelW: 4 * IN, labelH: 2 * IN,
    marginLeft: 0.15625 * IN, marginTop: 0.5 * IN, pitchX: 4.1875 * IN, pitchY: 2 * IN,
  },
  {
    // Brother QL continuous/die-cut tape; one label per printed page.
    id: 'roll-62x29',
    name: 'Label printer — 62 × 29 mm (Brother DK-11209)',
    pageW: 62, pageH: 29, cols: 1, rows: 1,
    labelW: 62, labelH: 29, marginLeft: 0, marginTop: 0, pitchX: 62, pitchY: 29,
  },
  {
    // No label stock: print on paper, cut out, tape on.
    id: 'paper-grid',
    name: 'Plain paper — 2 in squares to cut out, 12 per sheet',
    pageW: 8.5 * IN, pageH: 11 * IN, cols: 3, rows: 4,
    labelW: 2 * IN, labelH: 2 * IN,
    marginLeft: 0.75 * IN, marginTop: 1 * IN, pitchX: 2.5 * IN, pitchY: 2.5 * IN, cutLines: true,
  },
];

export const perPage = (s: LabelStock) => s.cols * s.rows;

export interface Slot<T> {
  /** null = a skipped or unused position. */
  label: T | null;
  x: number;
  y: number;
}

/**
 * Lay labels onto pages, row by row. `startAt` (1-based) skips used positions
 * on a partly used first sheet, so a half sheet of 5160s isn't wasted.
 */
export function paginate<T>(labels: readonly T[], stock: LabelStock, startAt = 1): Slot<T>[][] {
  const n = perPage(stock);
  const skip = Math.min(Math.max(0, Math.floor(startAt) - 1), n - 1);
  const pages: Slot<T>[][] = [];
  const total = skip + labels.length;
  for (let p = 0; p * n < total; p++) {
    const page: Slot<T>[] = [];
    for (let i = 0; i < n; i++) {
      const at = p * n + i;
      const col = i % stock.cols;
      const row = Math.floor(i / stock.cols);
      page.push({
        label: at >= skip && at - skip < labels.length ? labels[at - skip] : null,
        x: stock.marginLeft + col * stock.pitchX,
        y: stock.marginTop + row * stock.pitchY,
      });
    }
    pages.push(page);
  }
  return pages;
}
