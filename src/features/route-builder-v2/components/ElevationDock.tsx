/**
 * ElevationDock — Route Builder 2.0 bottom elevation dock.
 *
 * Houses the ElevationPanel as a collapsible bottom row of the map column
 * (replaces the old absolute bottom strip that overlapped the controls).
 * Collapsed shows a thin labeled bar; expanded shows a slim caret strip
 * over the chart (ElevationPanel renders its own "Elevation" header + gain).
 * Forwards the chart→map scrubber callback unchanged.
 */

import { Box, Text, UnstyledButton } from '@mantine/core';
import { CaretDown, CaretUp, Path } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { ElevationPanel } from './ElevationPanel';
import type { ElevationPoint } from '../../../hooks/route-builder';

export interface ElevationDockProps {
  profile: ElevationPoint[] | null;
  collapsed: boolean;
  onCollapsedChange: (next: boolean) => void;
  onHoverKm?: (km: number | null) => void;
}

export function ElevationDock({
  profile,
  collapsed,
  onCollapsedChange,
  onHoverKm,
}: ElevationDockProps) {
  if (!profile || profile.length < 2) return null;

  if (collapsed) {
    return (
      <Box
        data-testid="rb2-elevation-dock"
        style={{ backgroundColor: RB2.cardBg, borderTop: `1px solid ${RB2.border}` }}
      >
        <UnstyledButton
          data-testid="rb2-elevation-dock-toggle"
          onClick={() => onCollapsedChange(false)}
          aria-expanded={false}
          aria-label="Expand elevation profile"
          style={{
            width: '100%',
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Path size={14} color={RB2.textTertiary} />
            <Text
              style={{
                fontFamily: RB2_FONT.mono,
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: RB2.textTertiary,
              }}
            >
              Elevation
            </Text>
          </Box>
          <CaretUp size={14} color={RB2.textTertiary} />
        </UnstyledButton>
      </Box>
    );
  }

  return (
    <Box
      data-testid="rb2-elevation-dock"
      style={{ backgroundColor: RB2.cardBg, borderTop: `1px solid ${RB2.border}` }}
    >
      <UnstyledButton
        data-testid="rb2-elevation-dock-toggle"
        onClick={() => onCollapsedChange(true)}
        aria-expanded={true}
        aria-label="Collapse elevation profile"
        style={{
          width: '100%',
          padding: '4px 14px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <CaretDown size={14} color={RB2.textTertiary} />
      </UnstyledButton>
      <Box style={{ padding: '0 12px 8px' }}>
        <ElevationPanel profile={profile} fillWidth onHoverKm={onHoverKm} />
      </Box>
    </Box>
  );
}

export default ElevationDock;
