/**
 * Brush window state math: clamping, minimum span, handle/pan updates.
 * All in x-domain units (seconds or km) — pixel conversion lives with the
 * component's scale.
 */

export interface BrushWindow {
  x0: number;
  x1: number;
}

/** Minimum selectable span: 1% of the ride, floored at 30 x-units-worth
 *  for time axes (30 s) and 0.2 for distance (200 m). */
export function minBrushSpan(domainMin: number, domainMax: number, isTime: boolean): number {
  const span = domainMax - domainMin;
  return Math.min(span, Math.max(span * 0.01, isTime ? 30 : 0.2));
}

/** Clamp a proposed window into the domain, preserving at least minSpan. */
export function clampBrushWindow(
  x0: number,
  x1: number,
  domainMin: number,
  domainMax: number,
  minSpan: number
): BrushWindow {
  let a = Math.max(domainMin, Math.min(x0, x1));
  let b = Math.min(domainMax, Math.max(x0, x1));
  if (b - a < minSpan) {
    const mid = (a + b) / 2;
    a = mid - minSpan / 2;
    b = mid + minSpan / 2;
    if (a < domainMin) {
      a = domainMin;
      b = Math.min(domainMax, a + minSpan);
    }
    if (b > domainMax) {
      b = domainMax;
      a = Math.max(domainMin, b - minSpan);
    }
  }
  return { x0: a, x1: b };
}

/** Move one handle; the other edge stays anchored. */
export function resizeBrushWindow(
  window: BrushWindow,
  handle: 'start' | 'end',
  newX: number,
  domainMin: number,
  domainMax: number,
  minSpan: number
): BrushWindow {
  if (handle === 'start') {
    return clampBrushWindow(Math.min(newX, window.x1 - minSpan), window.x1, domainMin, domainMax, minSpan);
  }
  return clampBrushWindow(window.x0, Math.max(newX, window.x0 + minSpan), domainMin, domainMax, minSpan);
}

/** Pan the whole window by dx, clamped so the span is preserved exactly. */
export function panBrushWindow(
  window: BrushWindow,
  dx: number,
  domainMin: number,
  domainMax: number
): BrushWindow {
  const span = window.x1 - window.x0;
  let a = window.x0 + dx;
  if (a < domainMin) a = domainMin;
  if (a + span > domainMax) a = domainMax - span;
  return { x0: a, x1: a + span };
}

/** True when the window covers (effectively) the whole domain. */
export function isFullWindow(
  window: BrushWindow | null,
  domainMin: number,
  domainMax: number
): boolean {
  if (!window) return true;
  const eps = (domainMax - domainMin) * 1e-6;
  return window.x0 - domainMin <= eps && domainMax - window.x1 <= eps;
}
