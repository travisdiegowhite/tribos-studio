/**
 * Brush strip: full-ride overview with a draggable, resizable selection
 * window — the primary zoom control (touch-first: ≥44 px handle targets,
 * Pointer Events with capture; double-click/double-tap the strip resets).
 */

import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Box } from '@mantine/core';
import { aggregateColumns } from '../model/columnAggregate';
import {
  clampBrushWindow,
  resizeBrushWindow,
  panBrushWindow,
  isFullWindow,
  type BrushWindow,
} from '../model/brushState';
import { useElementWidth } from '../hooks/useElementWidth';

const STRIP_HEIGHT = 44;
const HANDLE_HIT_WIDTH = 28;
const HANDLE_BAR_WIDTH = 6;

type DragMode =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'pan'; grabOffsetX: number };

interface BrushStripProps {
  xs: number[];
  values: (number | null)[];
  domainMin: number;
  domainMax: number;
  window: BrushWindow | null;
  onWindowChange: (window: BrushWindow | null) => void;
  minSpan: number;
  seriesColor: string;
  accentColor: string;
  dimColor: string;
}

export function BrushStrip({
  xs,
  values,
  domainMin,
  domainMax,
  window: brushWindow,
  onWindowChange,
  minSpan,
  seriesColor,
  accentColor,
  dimColor,
}: BrushStripProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragMode | null>(null);

  const span = domainMax - domainMin;
  const toPx = useCallback(
    (x: number) => (span > 0 ? ((x - domainMin) / span) * width : 0),
    [domainMin, span, width]
  );
  const toX = useCallback(
    (px: number) => domainMin + (width > 0 ? (px / width) * span : 0),
    [domainMin, span, width]
  );

  const effective: BrushWindow = brushWindow ?? { x0: domainMin, x1: domainMax };
  const x0Px = toPx(effective.x0);
  const x1Px = toPx(effective.x1);

  // Overview series — muted single-color columns of the WHOLE ride.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = typeof window !== 'undefined' ? globalThis.devicePixelRatio || 1 : 1;
    const w = Math.round(width * dpr);
    const h = Math.round(STRIP_HEIGHT * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    ctx.clearRect(0, 0, w, h);

    const { maxs } = aggregateColumns(xs, values, 0, xs.length - 1, domainMin, domainMax, w);
    let dataMax = 0;
    for (const v of maxs) if (v != null && v > dataMax) dataMax = v;
    if (dataMax <= 0) return;
    ctx.fillStyle = seriesColor;
    ctx.globalAlpha = 0.55;
    for (let c = 0; c < w; c++) {
      const v = maxs[c];
      if (v == null) continue;
      const yTop = h - (v / dataMax) * h;
      ctx.fillRect(c, yTop, 1, h - yTop);
    }
    ctx.globalAlpha = 1;
  }, [xs, values, domainMin, domainMax, width, seriesColor]);

  const applyDrag = useCallback(
    (clientX: number, target: HTMLElement) => {
      const drag = dragRef.current;
      if (!drag) return;
      const rect = target.getBoundingClientRect();
      const x = toX(clientX - rect.left);
      let next: BrushWindow;
      if (drag.kind === 'pan') {
        const current = brushWindow ?? { x0: domainMin, x1: domainMax };
        next = panBrushWindow(current, x - drag.grabOffsetX, domainMin, domainMax);
        drag.grabOffsetX = x;
      } else {
        const current = brushWindow ?? { x0: domainMin, x1: domainMax };
        next = resizeBrushWindow(current, drag.kind, x, domainMin, domainMax, minSpan);
      }
      onWindowChange(isFullWindow(next, domainMin, domainMax) ? null : next);
    },
    [brushWindow, domainMin, domainMax, minSpan, onWindowChange, toX]
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const container = e.currentTarget;
      const rect = container.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const nearStart = Math.abs(px - x0Px) <= HANDLE_HIT_WIDTH / 2;
      const nearEnd = Math.abs(px - x1Px) <= HANDLE_HIT_WIDTH / 2;
      if (nearStart && (!nearEnd || Math.abs(px - x0Px) <= Math.abs(px - x1Px))) {
        dragRef.current = { kind: 'start' };
      } else if (nearEnd) {
        dragRef.current = { kind: 'end' };
      } else if (px > x0Px && px < x1Px && brushWindow) {
        dragRef.current = { kind: 'pan', grabOffsetX: toX(px) };
      } else {
        // Press on the track: start a fresh selection from here.
        const x = toX(px);
        const seeded = clampBrushWindow(x, x + minSpan, domainMin, domainMax, minSpan);
        onWindowChange(seeded);
        dragRef.current = { kind: 'end' };
      }
      container.setPointerCapture(e.pointerId);
    },
    [brushWindow, domainMin, domainMax, minSpan, onWindowChange, toX, x0Px, x1Px]
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (dragRef.current) applyDrag(e.clientX, e.currentTarget);
    },
    [applyDrag]
  );

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const handleStyle = (px: number): React.CSSProperties => ({
    position: 'absolute',
    left: px - HANDLE_BAR_WIDTH / 2,
    top: 4,
    width: HANDLE_BAR_WIDTH,
    height: STRIP_HEIGHT - 8,
    backgroundColor: accentColor,
    pointerEvents: 'none',
  });

  return (
    <Box
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => onWindowChange(null)}
      style={{
        position: 'relative',
        height: STRIP_HEIGHT,
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-card)',
        touchAction: 'none',
        cursor: 'ew-resize',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
      {width > 0 && brushWindow && (
        <>
          {/* Dim the unselected regions */}
          <Box style={{ position: 'absolute', left: 0, top: 0, width: Math.max(0, x0Px), height: '100%', backgroundColor: dimColor, opacity: 0.55, pointerEvents: 'none' }} />
          <Box style={{ position: 'absolute', left: x1Px, top: 0, width: Math.max(0, width - x1Px), height: '100%', backgroundColor: dimColor, opacity: 0.55, pointerEvents: 'none' }} />
          {/* Window outline */}
          <Box style={{ position: 'absolute', left: x0Px, top: 0, width: Math.max(0, x1Px - x0Px), height: '100%', border: `1px solid ${accentColor}`, pointerEvents: 'none' }} />
        </>
      )}
      {width > 0 && (
        <>
          <Box style={handleStyle(x0Px)} />
          <Box style={handleStyle(x1Px)} />
        </>
      )}
    </Box>
  );
}
