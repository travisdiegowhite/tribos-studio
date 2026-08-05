/**
 * Crosshair interaction layer: hover (desktop) or press/drag (touch) shows
 * a hairline + value pill snapped to the nearest sample. `touch-action:
 * pan-y` keeps vertical page scrolling alive while horizontal drags scrub.
 */

import { useCallback } from 'react';
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
  xScale: LinearScale;
  xMode: XMode;
  widthPx: number;
  heightPx: number;
  valueLabel: (value: number) => string;
  accentColor: string;
  hairlineColor: string;
}

export function CrosshairLayer({
  xs,
  values,
  crosshairIndex,
  onCrosshairChange,
  xScale,
  xMode,
  widthPx,
  heightPx,
  valueLabel,
  accentColor,
  hairlineColor,
}: CrosshairLayerProps) {
  const handlePointer = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const x = invertScale(px, xScale);
      onCrosshairChange(nearestIndex(xs, x));
    },
    [xs, xScale, onCrosshairChange]
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
      onPointerMove={handlePointer}
      onPointerDown={handlePointer}
      onPointerLeave={() => onCrosshairChange(null)}
      style={{
        position: 'absolute',
        inset: 0,
        touchAction: 'pan-y',
        cursor: 'crosshair',
      }}
    >
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
