/**
 * Per-pixel-column aggregation: reduce a sample window to one min/max/mean
 * triple per horizontal pixel column. The canvas paints one thin vertical
 * bar (or area column) per entry, so a 14k-sample window renders as ~800
 * draw ops regardless of ride length — peak-preserving because each column
 * keeps its own max.
 */

export interface ColumnSeries {
  /** Per-column maxima (null = no data in that column). */
  maxs: (number | null)[];
  /** Per-column minima. */
  mins: (number | null)[];
  /** Per-column means. */
  means: (number | null)[];
}

/**
 * Aggregate `values[i0..i1]` into `columnCount` columns spanning [x0, x1].
 * xs must be monotonic and parallel to values. Null values are skipped and
 * leave gaps (a column with only nulls stays null — honest dropouts).
 */
export function aggregateColumns(
  xs: number[],
  values: (number | null)[],
  i0: number,
  i1: number,
  x0: number,
  x1: number,
  columnCount: number
): ColumnSeries {
  const maxs: (number | null)[] = new Array(columnCount).fill(null);
  const mins: (number | null)[] = new Array(columnCount).fill(null);
  const sums = new Float64Array(columnCount);
  const counts = new Uint32Array(columnCount);

  const span = x1 - x0;
  if (span <= 0 || columnCount <= 0) return { maxs, mins, means: maxs.slice() };

  for (let i = i0; i <= i1; i++) {
    const v = values[i];
    if (v == null) continue;
    let col = Math.floor(((xs[i] - x0) / span) * columnCount);
    if (col < 0) col = 0;
    if (col >= columnCount) col = columnCount - 1;
    if (maxs[col] === null || v > (maxs[col] as number)) maxs[col] = v;
    if (mins[col] === null || v < (mins[col] as number)) mins[col] = v;
    sums[col] += v;
    counts[col]++;
  }

  const means: (number | null)[] = new Array(columnCount).fill(null);
  for (let c = 0; c < columnCount; c++) {
    if (counts[c] > 0) means[c] = sums[c] / counts[c];
  }
  return { maxs, mins, means };
}
