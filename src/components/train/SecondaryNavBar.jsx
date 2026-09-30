import { Box, Group, Text, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

const tabs = [
  { value: 'calendar', label: 'Calendar' },
  { value: 'coach', label: 'Coach' },
  { value: 'race', label: 'Race' },
  { value: 'trends', label: 'Trends' },
  { value: 'power', label: 'Power' },
  { value: 'history', label: 'History' },
  { value: 'repeats', label: 'Repeats' },
  { value: 'insights', label: 'Insights' },
];

function SecondaryNavBar({ activeTab, onTabChange }) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  return (
    <Box
      style={{
        backgroundColor: 'var(--color-bg)',
        borderBottom: '1px solid var(--color-border)',
        padding: isMobile ? '0 8px' : 0,
        position: 'sticky',
        top: 60, // below the 60px masthead
        zIndex: 99,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
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
              onClick={() => onTabChange(tab.value)}
              style={{
                padding: isMobile ? '12px 14px' : '12px 18px 12px 0',
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
                    left: isMobile ? 14 : 0,
                    right: isMobile ? 14 : 18,
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
  );
}

export default SecondaryNavBar;
