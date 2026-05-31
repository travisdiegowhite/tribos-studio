/**
 * RB2DesktopLayout — Route Builder 2.0 desktop region shell.
 *
 * Replaces the floating-card overlay model with partitioned regions so
 * controls, map, elevation, and chat never fight for the same corner:
 *
 *   [ sidebar ][        map area        ][ chat ]
 *   [         ][   ...................   ][      ]
 *   [         ][      elevation dock     ][      ]
 *
 * Pure presentational: every region is a slot. All business logic stays
 * in the page. Mobile uses a different layout entirely (handled by the page).
 */

import { type ReactNode } from 'react';
import { Box, Paper, ScrollArea } from '@mantine/core';
import { RB2 } from './brand';

export interface RB2DesktopLayoutProps {
  /** Pinned, non-scrolling header at the top of the sidebar (e.g. stats). */
  stats?: ReactNode;
  /** Scrolling sidebar body (form, layers, waypoints, actions). */
  sidebar: ReactNode;
  /** The map and its on-map overlays (persona, loading/error/empty). */
  mapArea: ReactNode;
  /** Bottom dock under the map (elevation). Omit to hide. */
  elevation?: ReactNode;
  /** Right region (chat dock). Sizes itself via its own open/collapsed state. */
  chat?: ReactNode;
  /** Sidebar width in px. */
  sidebarWidth?: number;
}

export function RB2DesktopLayout({
  stats,
  sidebar,
  mapArea,
  elevation,
  chat,
  sidebarWidth = 352,
}: RB2DesktopLayoutProps) {
  return (
    <Box
      data-testid="rb2-desktop-layout"
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Left control sidebar */}
      <Paper
        radius={0}
        style={{
          width: sidebarWidth,
          flexShrink: 0,
          backgroundColor: RB2.bgSecondary,
          borderRight: `1px solid ${RB2.border}`,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        {stats && (
          <Box
            style={{
              padding: 12,
              borderBottom: `1px solid ${RB2.border}`,
              flexShrink: 0,
            }}
          >
            {stats}
          </Box>
        )}
        <ScrollArea style={{ flex: 1 }} type="auto">
          <Box
            style={{
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {sidebar}
          </Box>
        </ScrollArea>
      </Paper>

      {/* Center: map area on top, elevation dock at the bottom */}
      <Box
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        <Box style={{ flex: 1, position: 'relative', minHeight: 0 }}>{mapArea}</Box>
        {elevation && <Box style={{ flexShrink: 0 }}>{elevation}</Box>}
      </Box>

      {/* Right: chat dock (owns its own width via open/collapsed state) */}
      {chat && <Box style={{ flexShrink: 0, height: '100%' }}>{chat}</Box>}
    </Box>
  );
}

export default RB2DesktopLayout;
