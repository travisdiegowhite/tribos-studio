import { Box, Group, Text, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

const tabs = [
  { value: 'calendar', label: 'CALENDAR' },
  { value: 'coach', label: 'COACH' },
  { value: 'trends', label: 'TRENDS' },
  { value: 'power', label: 'POWER' },
  { value: 'history', label: 'HISTORY' },
  { value: 'insights', label: 'INSIGHTS' },
];

function SecondaryNavBar({ activeTab, onTabChange }) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  return (
    <Box
      style={{
        backgroundColor: '#141410',
        padding: isMobile ? '0 8px' : '0 16px',
        position: 'sticky',
        top: 59, // below main nav (56px) + retro stripe (3px)
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
                padding: isMobile ? '12px 14px' : '12px 20px',
                position: 'relative',
                transition: 'color 150ms ease',
              }}
            >
              <Text
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: isMobile ? 11 : 12,
                  fontWeight: 700,
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  color: isActive ? '#FFFFFF' : '#9A9990',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
              </Text>
              {isActive && (
                <Box
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: isMobile ? 14 : 20,
                    right: isMobile ? 14 : 20,
                    height: 2,
                    backgroundColor: 'var(--color-teal)',
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
