import { useState, useEffect } from 'react';
import { Container, Text, Paper, Group, ThemeIcon, SimpleGrid, Box, Stack } from '@mantine/core';
import { IconActivity, IconDeviceWatch, IconUpload, IconCheck } from '@tabler/icons-react';
import { useScrollReveal, usePrefersReducedMotion } from './useScrollReveal';

const integrations = [
  {
    name: 'Strava',
    subtitle: 'Auto-import rides',
    icon: IconActivity,
    color: '#FC4C02',
    themeColor: 'orange',
    delay: 0,
  },
  {
    name: 'Garmin',
    subtitle: 'Sync activities & routes',
    icon: IconDeviceWatch,
    color: '#007CC3',
    themeColor: 'blue',
    delay: 400,
  },
  {
    name: 'Wahoo',
    subtitle: 'Sync routes to device',
    icon: IconDeviceWatch,
    color: '#1A73E8',
    themeColor: 'cyan',
    delay: 800,
  },
  {
    name: 'FIT Upload',
    subtitle: 'Direct file upload',
    icon: IconUpload,
    color: 'var(--tribos-terracotta-500)',
    themeColor: 'terracotta',
    delay: 1200,
  },
];

export default function ConnectStep() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.2 });
  const reducedMotion = usePrefersReducedMotion();
  const [activeCards, setActiveCards] = useState(new Set());

  useEffect(() => {
    if (!isVisible || reducedMotion) {
      if (reducedMotion) {
        setActiveCards(new Set([0, 1, 2, 3]));
      }
      return;
    }

    const timers = integrations.map((integration, index) =>
      setTimeout(() => {
        setActiveCards(prev => new Set([...prev, index]));
      }, integration.delay)
    );

    return () => timers.forEach(clearTimeout);
  }, [isVisible, reducedMotion]);

  return (
    <Box py={{ base: 60, md: 100 }} px={{ base: 'md', md: 'xl' }}>
      <Container size="md">
        <div ref={ref} className={`landing-step ${isVisible ? 'visible' : ''}`}>
          <Stack gap="xl" align="center">
            <div>
              <Text
                className="step-label"
                size="xs"
                ta="center"
                style={{
                  fontFamily: "'DM Mono', monospace",
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                  color: 'var(--tribos-terracotta-500)',
                  marginBottom: 8,
                }}
              >
                Step 01 — Connect
              </Text>
              <Text
                className="step-title"
                ta="center"
                style={{
                  fontSize: 'clamp(1.4rem, 3.5vw, 2.2rem)',
                  fontFamily: "'Anybody', sans-serif",
                  fontWeight: 800,
                  color: 'var(--tribos-text-primary)',
                }}
              >
                Link your accounts. One click each.
              </Text>
            </div>

            <SimpleGrid
              className="step-content"
              cols={{ base: 1, xs: 2, md: 4 }}
              spacing="lg"
              style={{ width: '100%' }}
            >
              {integrations.map((integration, index) => {
                const isActive = activeCards.has(index);
                const Icon = integration.icon;
                return (
                  <Paper
                    key={integration.name}
                    p="lg"
                    className={`integration-card ${isActive ? 'active' : ''}`}
                    style={{
                      textAlign: 'center',
                      border: `2px solid ${isActive ? integration.color : 'var(--tribos-border-default)'}`,
                      boxShadow: isActive ? `0 0 20px ${integration.color}20` : undefined,
                    }}
                  >
                    <Stack align="center" gap="sm">
                      <ThemeIcon
                        size={50}
                        radius="xl"
                        color={integration.themeColor}
                        variant="light"
                      >
                        <Icon size={24} />
                      </ThemeIcon>
                      <Text fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
                        {integration.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {integration.subtitle}
                      </Text>

                      {/* Connected badge */}
                      <Group
                        gap={4}
                        className="connected-badge"
                        style={{
                          opacity: isActive ? 1 : 0,
                          transform: isActive ? 'scale(1)' : 'scale(0.8)',
                          transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
                        }}
                      >
                        <IconCheck size={14} color="var(--tribos-sage-500)" />
                        <Text
                          size="xs"
                          fw={600}
                          style={{
                            fontFamily: "'DM Mono', monospace",
                            letterSpacing: '1px',
                            textTransform: 'uppercase',
                            color: 'var(--tribos-sage-500)',
                          }}
                        >
                          Connected
                        </Text>
                      </Group>
                    </Stack>
                  </Paper>
                );
              })}
            </SimpleGrid>
          </Stack>
        </div>
      </Container>
    </Box>
  );
}
