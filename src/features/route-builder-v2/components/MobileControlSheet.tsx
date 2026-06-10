/**
 * MobileControlSheet — Route Builder 2.0 mobile bottom sheet.
 *
 * Replaces the old full-height stacked overlay column that buried the map.
 * The map stays the hero: by default only a ~56px tab strip sits at the
 * bottom. Tapping a tab raises a sheet (~58vh) with that section's content;
 * tapping the active tab (or the close ✕) collapses it again. One section is
 * open at a time. Controlled by the page so it can open a relevant tab
 * programmatically (e.g. "Build" on a chat cold-start).
 */

import { type ReactNode } from 'react';
import { Box, Text, UnstyledButton } from '@mantine/core';
import { X } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';

export interface MobileSheetTab {
  id: string;
  label: string;
  icon: ReactNode;
  content: ReactNode;
  /** Optional count badge on the tab (e.g. active layers). */
  badge?: number;
}

export interface MobileControlSheetProps {
  tabs: MobileSheetTab[];
  /** Active tab id, or null when collapsed. Controlled by the page. */
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
  /** Sheet height when a tab is open. */
  openHeight?: string;
}

export function MobileControlSheet({
  tabs,
  activeId,
  onActiveChange,
  openHeight = '58vh',
}: MobileControlSheetProps) {
  const active = tabs.find((t) => t.id === activeId) ?? null;

  return (
    <Box
      data-testid="rb2-mobile-sheet"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Open panel */}
      {active && (
        <Box
          data-testid="rb2-mobile-sheet-panel"
          style={{
            height: openHeight,
            backgroundColor: RB2.bgBase,
            borderTop: `1px solid ${RB2.border}`,
            boxShadow: RB2.shadowOverlay,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
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
              data-testid="rb2-mobile-sheet-close"
              aria-label={`Close ${active.label}`}
              onClick={() => onActiveChange(null)}
              style={{ padding: 4 }}
            >
              <X size={18} color={RB2.textTertiary} />
            </UnstyledButton>
          </Box>
          <Box
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {active.content}
          </Box>
        </Box>
      )}

      {/* Tab strip — always visible */}
      <Box
        style={{
          display: 'flex',
          backgroundColor: RB2.bgSecondary,
          borderTop: `1px solid ${RB2.border}`,
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <UnstyledButton
              key={tab.id}
              data-testid={`rb2-mobile-tab-${tab.id}`}
              aria-label={tab.label}
              aria-pressed={isActive}
              onClick={() => onActiveChange(isActive ? null : tab.id)}
              style={{
                position: 'relative',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '8px 4px',
                borderTop: `2px solid ${isActive ? RB2.teal : 'transparent'}`,
                backgroundColor: isActive ? RB2.cardBg : 'transparent',
                color: isActive ? RB2.teal : RB2.textSecondary,
              }}
            >
              {tab.icon}
              <Text
                style={{
                  fontFamily: RB2_FONT.mono,
                  fontSize: 9,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                {tab.label}
              </Text>
              {tab.badge != null && tab.badge > 0 && (
                <Box
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: '50%',
                    transform: 'translateX(14px)',
                    minWidth: 14,
                    height: 14,
                    padding: '0 3px',
                    backgroundColor: RB2.teal,
                    color: RB2.textInverse,
                    fontFamily: RB2_FONT.mono,
                    fontSize: 9,
                    lineHeight: '14px',
                    textAlign: 'center',
                  }}
                >
                  {tab.badge}
                </Box>
              )}
            </UnstyledButton>
          );
        })}
      </Box>
    </Box>
  );
}

export default MobileControlSheet;
