/**
 * WaypointListPanel — Route Builder 2.0 waypoint list.
 *
 * Shows the current waypoints with remove buttons and drag-to-reorder.
 * Reordering uses native HTML5 drag (no DnD dependency — the list is
 * short); dropping fires `onReorder(from, to)` which the page routes
 * through useMapInteraction to re-snap. Hidden when there are no waypoints.
 */

import { useState } from 'react';
import { Box, Text, UnstyledButton } from '@mantine/core';
import { DotsSixVertical, X } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { trackRb2 } from '../telemetry/trackRb2';
import type { Coordinate } from '../../../types/geo';

export interface WaypointListPanelProps {
  waypoints: ReadonlyArray<{ id: string; position: Coordinate; type?: string }>;
  onRemove: (index: number) => void;
  /** Drag-to-reorder a waypoint from one index to another (then re-route). */
  onReorder?: (fromIndex: number, toIndex: number) => void;
  isMobile?: boolean;
}

export function WaypointListPanel({
  waypoints,
  onRemove,
  onReorder,
  isMobile = false,
}: WaypointListPanelProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const reorderable = Boolean(onReorder) && waypoints.length > 2;

  if (!waypoints || waypoints.length === 0) return null;

  const handleDrop = (toIndex: number) => {
    if (dragIndex !== null && dragIndex !== toIndex && onReorder) {
      onReorder(dragIndex, toIndex);
      trackRb2('waypoint_reordered', { from: dragIndex, to: toIndex });
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <Box
      data-testid="rb2-waypoint-list"
      style={{
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        borderRadius: 0,
        padding: '10px 12px',
        boxShadow: RB2.shadowCard,
        width: isMobile ? '100%' : 320,
        maxHeight: 220,
        overflowY: 'auto',
      }}
    >
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: RB2.textTertiary,
          marginBottom: 6,
        }}
      >
        Waypoints ({waypoints.length})
      </Text>
      <Box>
        {waypoints.map((wp, idx) => {
          const isStart = idx === 0;
          const isEnd = idx === waypoints.length - 1;
          const label = isStart ? 'Start' : isEnd ? 'End' : `Waypoint ${idx}`;
          return (
            <Box
              key={wp.id}
              data-testid={`rb2-waypoint-row-${idx}`}
              draggable={reorderable}
              onDragStart={reorderable ? () => setDragIndex(idx) : undefined}
              onDragOver={
                reorderable
                  ? (e) => {
                      e.preventDefault();
                      if (overIndex !== idx) setOverIndex(idx);
                    }
                  : undefined
              }
              onDrop={reorderable ? () => handleDrop(idx) : undefined}
              onDragEnd={
                reorderable
                  ? () => {
                      setDragIndex(null);
                      setOverIndex(null);
                    }
                  : undefined
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
                padding: '6px 0',
                borderBottom:
                  idx < waypoints.length - 1 ? `1px solid ${RB2.bgSecondary}` : undefined,
                backgroundColor:
                  reorderable && overIndex === idx && dragIndex !== idx
                    ? RB2.bgSecondary
                    : undefined,
                opacity: dragIndex === idx ? 0.4 : 1,
                cursor: reorderable ? 'grab' : undefined,
              }}
            >
              <Box style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {reorderable && (
                  <DotsSixVertical
                    size={14}
                    color={RB2.textTertiary}
                    weight="bold"
                    data-testid={`rb2-waypoint-drag-${idx}`}
                    style={{ flexShrink: 0 }}
                  />
                )}
                <Box style={{ minWidth: 0 }}>
                  <Text
                    style={{
                      fontFamily: RB2_FONT.body,
                      fontSize: 13,
                      color: RB2.textPrimary,
                      lineHeight: 1.2,
                    }}
                  >
                    {label}
                  </Text>
                  <Text
                    style={{
                      fontFamily: RB2_FONT.mono,
                      fontSize: 10,
                      color: RB2.textTertiary,
                      letterSpacing: '0.04em',
                    }}
                  >
                    {wp.position[1].toFixed(4)}, {wp.position[0].toFixed(4)}
                  </Text>
                </Box>
              </Box>
              <UnstyledButton
                onClick={() => {
                  onRemove(idx);
                  trackRb2('waypoint_removed', {});
                }}
                aria-label={`Remove ${label.toLowerCase()}`}
                style={{ padding: 4, flexShrink: 0 }}
              >
                <X size={14} color={RB2.textTertiary} />
              </UnstyledButton>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export default WaypointListPanel;
