/**
 * RB2DesktopLayout — Route Builder 2.0 desktop region shell.
 *
 * Three regions, no overlapping floating cards:
 *
 *   [ rail+flyout ][        map area        ][ chat ]
 *   [            ][   ...................   ][      ]
 *   [            ][      elevation dock     ][      ]
 *
 * The left region is a thin icon rail (with an optional flyout); resting
 * chrome is ~48px instead of a 352px sidebar. Set-once controls live behind
 * the rail, the structured form is folded into the chat, and only the map,
 * a compact stats strip, and chat are ever permanently on screen.
 *
 * Pure presentational: every region is a slot. Business logic stays in the
 * page. Mobile uses a different layout entirely (handled by the page).
 */

import { type ReactNode } from 'react';
import { Box } from '@mantine/core';

export interface RB2DesktopLayoutProps {
  /** Left region — the ControlRail (icon rail + flyout). */
  left: ReactNode;
  /** The map and its on-map overlays (persona, loading/error/empty). */
  mapArea: ReactNode;
  /** Compact stats strip pinned to the top of the map area. Omit to hide. */
  statsStrip?: ReactNode;
  /** Bottom dock under the map (elevation). Omit to hide. */
  elevation?: ReactNode;
  /** Right region (chat dock). Sizes itself via its own open/collapsed state. */
  chat?: ReactNode;
}

export function RB2DesktopLayout({
  left,
  mapArea,
  statsStrip,
  elevation,
  chat,
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
      {/* Left: icon rail (+ optional flyout) */}
      {left}

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
        <Box style={{ flex: 1, position: 'relative', minHeight: 0 }}>
          {mapArea}
          {statsStrip && (
            <Box
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                zIndex: 20,
                maxWidth: 'calc(100% - 24px)',
              }}
            >
              {statsStrip}
            </Box>
          )}
        </Box>
        {elevation && <Box style={{ flexShrink: 0 }}>{elevation}</Box>}
      </Box>

      {/* Right: chat dock (owns its own width via open/collapsed state) */}
      {chat && <Box style={{ flexShrink: 0, height: '100%' }}>{chat}</Box>}
    </Box>
  );
}

export default RB2DesktopLayout;
