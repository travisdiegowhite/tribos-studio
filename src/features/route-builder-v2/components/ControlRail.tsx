/**
 * ControlRail — Route Builder 2.0 desktop left activity rail.
 *
 * Replaces the always-open ~352px control sidebar with a thin ~48px rail
 * of icon buttons (VS Code / Figma activity-bar pattern). Clicking an icon
 * opens a 320px flyout panel over the map's left edge; clicking the active
 * icon again (or the flyout's close button) dismisses it. At most one
 * flyout is open at a time, and the map keeps nearly its full width.
 *
 * The rail is purely presentational chrome: each item supplies its own
 * panel content (Layers, Waypoints, Save/Load). Items can be disabled
 * (e.g. route-only panels before a route exists) and badged with a count.
 */

import { type ReactNode } from 'react';
import { Box, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { X } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';

export interface RailItem {
  id: string;
  label: string;
  icon: ReactNode;
  /** Flyout content. Omit to make the item a plain action (see onSelect). */
  panel?: ReactNode;
  disabled?: boolean;
  /** Small count badge on the icon (e.g. active layers, waypoint count). */
  badge?: number;
}

export interface ControlRailProps {
  items: RailItem[];
  /** Currently open flyout id, or null. Controlled by the page. */
  openId: string | null;
  onOpenChange: (next: string | null) => void;
  railWidth?: number;
  panelWidth?: number;
}

const RAIL_WIDTH = 48;
const PANEL_WIDTH = 320;

export function ControlRail({
  items,
  openId,
  onOpenChange,
  railWidth = RAIL_WIDTH,
  panelWidth = PANEL_WIDTH,
}: ControlRailProps) {
  const active = items.find((i) => i.id === openId && !i.disabled) ?? null;

  return (
    <Box
      data-testid="rb2-control-rail"
      style={{ display: 'flex', flexDirection: 'row', height: '100%', flexShrink: 0 }}
    >
      {/* Icon rail */}
      <Box
        style={{
          width: railWidth,
          flexShrink: 0,
          backgroundColor: RB2.bgSecondary,
          borderRight: `1px solid ${RB2.border}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 8,
          gap: 4,
        }}
      >
        {items.map((item) => {
          const isActive = item.id === openId && !item.disabled;
          return (
            <Tooltip
              key={item.id}
              label={item.label}
              position="right"
              withinPortal
              disabled={item.disabled}
            >
              <UnstyledButton
                data-testid={`rb2-rail-${item.id}`}
                onClick={() => {
                  if (item.disabled) return;
                  onOpenChange(isActive ? null : item.id);
                }}
                aria-label={item.label}
                aria-pressed={isActive}
                disabled={item.disabled}
                style={{
                  position: 'relative',
                  width: 36,
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 0,
                  borderLeft: `2px solid ${isActive ? RB2.teal : 'transparent'}`,
                  backgroundColor: isActive ? RB2.cardBg : 'transparent',
                  color: item.disabled
                    ? RB2.border
                    : isActive
                      ? RB2.teal
                      : RB2.textSecondary,
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  opacity: item.disabled ? 0.5 : 1,
                }}
              >
                {item.icon}
                {item.badge != null && item.badge > 0 && (
                  <Box
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      minWidth: 14,
                      height: 14,
                      padding: '0 3px',
                      backgroundColor: RB2.teal,
                      color: RB2.textInverse,
                      borderRadius: 0,
                      fontFamily: RB2_FONT.mono,
                      fontSize: 9,
                      lineHeight: '14px',
                      textAlign: 'center',
                    }}
                  >
                    {item.badge}
                  </Box>
                )}
              </UnstyledButton>
            </Tooltip>
          );
        })}
      </Box>

      {/* Flyout panel */}
      {active?.panel && (
        <Box
          data-testid="rb2-rail-flyout"
          style={{
            width: panelWidth,
            flexShrink: 0,
            height: '100%',
            backgroundColor: RB2.bgBase,
            borderRight: `1px solid ${RB2.border}`,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: RB2.shadowOverlay,
          }}
        >
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderBottom: `1px solid ${RB2.border}`,
              flexShrink: 0,
            }}
          >
            <Text
              style={{
                fontFamily: RB2_FONT.heading,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: RB2.textPrimary,
              }}
            >
              {active.label}
            </Text>
            <UnstyledButton
              data-testid="rb2-rail-flyout-close"
              onClick={() => onOpenChange(null)}
              aria-label={`Close ${active.label}`}
              style={{ padding: 4 }}
            >
              <X size={16} color={RB2.textTertiary} />
            </UnstyledButton>
          </Box>
          <Box style={{ flex: 1, overflowY: 'auto', padding: 12 }}>{active.panel}</Box>
        </Box>
      )}
    </Box>
  );
}

export default ControlRail;
