import { Container, Title, Text, Box, SimpleGrid, Stack } from '@mantine/core';
import { Path, Robot, TrendUp } from '@phosphor-icons/react';
import { useScrollReveal } from './useScrollReveal';

// Accent colors follow the retro-stripe bands (teal / orange / gold).
const FEATURES = [
  {
    label: '01 / Routes',
    title: 'Build routes worth riding',
    body: 'Describe the ride you want — distance, surface, climbing — and get a route on real roads and real gravel. Or drop waypoints and draw your own line. Export to your head unit when you’re done.',
    Icon: Path,
    accent: '#2A8C82',
  },
  {
    label: '02 / Coach',
    title: 'A coach that reads your rides',
    body: 'Connect Strava, Garmin, or Wahoo and the coach learns your training load and freshness from every ride. Ask it what to ride today and it answers in plain language — no charts required.',
    Icon: Robot,
    accent: '#D4600A',
  },
  {
    label: '03 / Training',
    title: 'Training that adapts to your life',
    body: 'Structured plans built around your goals and your schedule. Miss a day and the week rebalances. See your form trend without needing a sports-science degree.',
    Icon: TrendUp,
    accent: '#C49A0A',
  },
];

export default function FeatureCards() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.2 });

  return (
    <Box id="features" py={{ base: 32, md: 48 }} px={{ base: 'md', md: 'xl' }}>
      <Container size="lg">
        <div ref={ref} className={`landing-step ${isVisible ? 'visible' : ''}`}>
          <SimpleGrid className="step-content" cols={{ base: 1, md: 3 }} spacing="lg">
            {FEATURES.map(({ label, title, body, Icon, accent }) => (
              <Box
                key={label}
                style={{
                  background: 'var(--tribos-card)',
                  border: '1.5px solid var(--tribos-border-default)',
                  borderTop: `3px solid ${accent}`,
                  borderRadius: 0,
                  boxShadow: 'var(--tribos-shadow-card)',
                  padding: 24,
                }}
              >
                <Stack gap="sm">
                  <Icon size={22} color={accent} weight="duotone" />
                  <Text
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 10,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: accent,
                    }}
                  >
                    {label}
                  </Text>
                  <Title
                    order={3}
                    style={{
                      fontSize: 20,
                      color: 'var(--color-text-primary)',
                      lineHeight: 1.2,
                    }}
                  >
                    {title}
                  </Title>
                  <Text
                    size="sm"
                    style={{
                      color: 'var(--color-text-secondary)',
                      lineHeight: 1.6,
                    }}
                  >
                    {body}
                  </Text>
                </Stack>
              </Box>
            ))}
          </SimpleGrid>
        </div>
      </Container>
    </Box>
  );
}
