import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Group, Text, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

import { TRAIN_TABS, TRAIN_TAB_LABELS } from './trainTabs';

const tabs = TRAIN_TABS.map((value) => ({ value, label: TRAIN_TAB_LABELS[value] }));

/**
 * The /train tab strip. On a phone its six tabs need ~520px, so it scrolls
 * sideways: the active tab is scrolled into view (a deep link to "Find an
 * event" used to land with its tab off-screen), and a ruled "›" at the right
 * edge says there is more while there is (flat, per the design system: no
 * gradient fade).
 */
function SecondaryNavBar({ activeTab, onTabChange }) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const scrollRef = useRef(null);
  const activeRef = useRef(null);
  const [moreRight, setMoreRight] = useState(false);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    const tab = activeRef.current;
    if (el && tab && el.scrollWidth > el.clientWidth) {
      // Centre the active tab without moving the page vertically.
      const target = tab.offsetLeft - (el.clientWidth - tab.offsetWidth) / 2;
      el.scrollTo?.({ left: Math.max(0, target), behavior: 'auto' });
    }
    measure();
  }, [activeTab, isMobile, measure]);

  return (
    <Box
      style={{
        position: 'sticky',
        top: 60, // below the 60px masthead
        zIndex: 99,
        backgroundColor: 'var(--color-bg)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <Box
        ref={scrollRef}
        onScroll={measure}
        data-testid="train-tab-strip"
        style={{
          padding: isMobile ? '0 8px' : 0,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
      >
        <Group
          gap={0}
          wrap="nowrap"
          style={{ minWidth: isMobile ? 'max-content' : undefined }}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.value;
            return (
              <UnstyledButton
                key={tab.value}
                ref={isActive ? activeRef : undefined}
                onClick={() => onTabChange(tab.value)}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  padding: isMobile ? '12px 11px' : '12px 18px 12px 0',
                  position: 'relative',
                  transition: 'color 150ms ease',
                }}
              >
                <Text
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: isMobile ? 14 : 15,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab.label}
                </Text>
                {isActive && (
                  <Box
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      left: isMobile ? 11 : 0,
                      right: isMobile ? 11 : 18,
                      height: 2,
                      backgroundColor: 'var(--color-ink)',
                    }}
                  />
                )}
              </UnstyledButton>
            );
          })}
        </Group>
      </Box>
      {moreRight && (
        <Box
          aria-hidden
          data-testid="train-tab-more"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 1,
            width: 28,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--color-bg)',
            borderLeft: '1px solid var(--color-border)',
            fontFamily: 'var(--font-mono)',
            fontSize: 16,
            color: 'var(--color-text-secondary)',
          }}
        >
          ›
        </Box>
      )}
    </Box>
  );
}

export default SecondaryNavBar;
