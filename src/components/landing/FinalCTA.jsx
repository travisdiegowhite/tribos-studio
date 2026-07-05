import { Link } from 'react-router-dom';
import { Container, Title, Text, Button, Stack, Group, Box } from '@mantine/core';
import { useScrollReveal } from './useScrollReveal';
import { CaretRight, Check } from '@phosphor-icons/react';

const TRUST_ITEMS = [
  'No credit card',
  'No account needed to build routes',
  'Syncs with Strava, Garmin & Wahoo',
];

export default function FinalCTA() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.3 });

  return (
    <Box py={{ base: 60, md: 100 }} px={{ base: 'md', md: 'xl' }}>
      <Container size="sm">
        <div ref={ref} className={`landing-step ${isVisible ? 'visible' : ''}`}>
          <Stack gap="xl" align="center" ta="center">
            <Title
              className="step-title"
              order={2}
              style={{
                fontSize: 'clamp(1.6rem, 4vw, 2.6rem)',
                color: 'var(--color-text-primary)',
                lineHeight: 1.15,
              }}
            >
              Free to try. Free account for the rest.
            </Title>

            <Text
              className="step-desc"
              size="lg"
              style={{
                color: 'var(--color-text-secondary)',
                maxWidth: 480,
                lineHeight: 1.6,
              }}
            >
              The route builder works right now, without an account. A free
              account adds ride sync, the coach, and training plans.
            </Text>

            <Group className="step-content" gap="md" justify="center">
              <Button
                component={Link}
                to="/ride/new"
                size="lg"
                color="teal"
                rightSection={<CaretRight size={18} />}
              >
                Open the Route Builder
              </Button>
              <Button
                component={Link}
                to="/auth"
                state={{ fromBetaSignup: true }}
                size="lg"
                variant="outline"
                color="teal"
              >
                Create Free Account
              </Button>
            </Group>

            <Group className="step-content" gap="lg" justify="center" wrap="wrap">
              {TRUST_ITEMS.map((item) => (
                <Group key={item} gap={4}>
                  <Check size={14} color="var(--color-gold)" />
                  <Text size="xs" style={{ color: 'var(--color-text-muted)', fontFamily: "'DM Mono', monospace" }}>
                    {item}
                  </Text>
                </Group>
              ))}
            </Group>
          </Stack>
        </div>
      </Container>
    </Box>
  );
}
