/**
 * WaypointListPanel — Route Builder 2.0 waypoint list.
 *
 * Shows the current waypoints with remove buttons. Hidden when there
 * are no waypoints.
 */

import { Box, Text, UnstyledButton } from '@mantine/core';
import { X } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { trackRb2 } from '../telemetry/trackRb2';
import type { Coordinate } from '../../../routing/executor';

export interface WaypointListPanelProps {
  waypoints: ReadonlyArray<{ id: string; position: Coordinate; type?: string }>;
  onRemove: (index: number) => void;
  isMobile?: boolean;
}

export function WaypointListPanel({ waypoints, onRemove, isMobile = false }: WaypointListPanelProps) {
  if (!waypoints || waypoints.length === 0) return null;
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
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom:
                  idx < waypoints.length - 1 ? `1px solid ${RB2.bgSecondary}` : undefined,
              }}
            >
              <Box>
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
              <UnstyledButton
                onClick={() => {
                  onRemove(idx);
                  trackRb2('waypoint_removed', {});
                }}
                aria-label={`Remove ${label.toLowerCase()}`}
                style={{ padding: 4 }}
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
