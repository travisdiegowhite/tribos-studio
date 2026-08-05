/**
 * Crosshair interaction layer: hover (desktop) or press/drag (touch) shows
 * a hairline + value pill snapped to the nearest sample. `touch-action:
 * pan-y` keeps vertical page scrolling alive while horizontal drags scrub.
 *
 * Mouse drag additionally selects an x-range and commits it as a zoom
 * window (touch never does — the brush strip owns touch zoom, avoiding
 * the scrub-vs-zoom gesture ambiguity).
 */

import { useCallback, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { Box, Text } from '@mantine/core';
import { nearestIndex } from '../model/crosshair';
import { scaleValue, invertScale, formatXTick, type LinearScale } from '../model/chartScales';
import type { XMode } from '../model/streamTypes';

interface CrosshairLayerProps {
  xs: number[];
  values: (number | null)[];
  crosshairIndex: number | null;
  onCrosshairChange: (index: number | null) => void;
  /** Mouse drag-select zoom commit; null disables selection. */
  onWindowSelect?: ((x0: number, x1: number) => void) | null;
  xScale: LinearScale;
  xMode: XMode;
  widthPx: number;
  heightPx: number;
  valueLabel: (value: number) => string;
  accentColor: string;
  hairlineColor: string;
}

const MIN_SELECT_PX = 8;

export function CrosshairLayer({
  xs,
  values,
  crosshairIndex,
  onCrosshairChange,
  onWindowSelect,
  xScale,
  xMode,
  widthPx,
  heightPx,
  valueLabel,
  accentColor,
  hairlineColor,
}: CrosshairLayerProps) {
  const [dragRange, setDragRange] = useState<[number, number] | null>(null);
  const dragStartPx = useRef<number | null>(null);

  const pxFromEvent = (e: PointerEvent<HTMLDivElement>) =>
    e.clientX - e.currentTarget.getBoundingClientRect().left;

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const px = pxFromEvent(e);
      onCrosshairChange(nearestIndex(xs, invertScale(px, xScale)));
      if (e.pointerType === 'mouse' && onWindowSelect) {
        dragStartPx.current = px;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    },
    [xs, xScale, onCrosshairChange, onWindowSelect]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const px = pxFromEvent(e);
      onCrosshairChange(nearestIndex(xs, invertScale(px, xScale)));
      if (dragStartPx.current != null && Math.abs(px - dragStartPx.current) >= MIN_SELECT_PX) {
        setDragRange([Math.min(dragStartPx.current, px), Math.max(dragStartPx.current, px)]);
      }
    },
    [xs, xScale, onCrosshairChange]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (dragRange && onWindowSelect) {
        onWindowSelect(invertScale(dragRange[0], xScale), invertScale(dragRange[1], xScale));
      }
      dragStartPx.current = null;
      setDragRange(null);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [dragRange, onWindowSelect, xScale]
  );

  const idx = crosshairIndex;
  const hasCrosshair = idx != null && idx >= 0 && idx < xs.length;
  const crosshairPx = hasCrosshair ? scaleValue(xs[idx], xScale) : 0;
  const value = hasCrosshair ? values[idx] : null;

  // Clamp the pill inside the plot
  const pillHalf = 60;
  const pillLeft = Math.min(Math.max(crosshairPx, pillHalf), Math.max(widthPx - pillHalf, pillHalf));

  return (
    <Box
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => onCrosshairChange(null)}
      style={{
        position: 'absolute',
        inset: 0,
        touchAction: 'pan-y',
        cursor: 'crosshair',
      }}
    >
      {dragRange && (
        <Box
          style={{
            position: 'absolute',
            left: dragRange[0],
            top: 0,
            width: dragRange[1] - dragRange[0],
            height: heightPx,
            backgroundColor: hairlineColor,
            opacity: 0.12,
            border: `1px solid ${hairlineColor}`,
            pointerEvents: 'none',
          }}
        />
      )}
      {hasCrosshair && (
        <>
          <Box
            style={{
              position: 'absolute',
              left: crosshairPx,
              top: 0,
              width: 1,
              height: heightPx,
              backgroundColor: hairlineColor,
              pointerEvents: 'none',
            }}
          />
          <Box
            style={{
              position: 'absolute',
              left: pillLeft,
              top: 6,
              transform: 'translateX(-50%)',
              backgroundColor: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              padding: '2px 8px',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <Text size="xs" ff="monospace" component="span" c="var(--color-text-secondary)">
              {formatXTick(xs[idx], xMode)}
              {xMode === 'distance_km' ? ' km' : ''}
            </Text>
            <Text size="xs" ff="monospace" fw={600} component="span" ml={8} style={{ color: accentColor }}>
              {value == null ? '—' : valueLabel(value)}
            </Text>
          </Box>
        </>
      )}
    </Box>
  );
}
