import { Link } from 'react-router-dom';
import { Container, Title, Text, Button, Stack, Group, Box } from '@mantine/core';
import { IconChevronRight, IconCheck } from '@tabler/icons-react';
import { useScrollReveal } from './useScrollReveal';

export default function FinalCTA() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.3 });

  return (
    <Box
      py={{ base: 80, md: 120 }}
      px={{ base: 'md', md: 'xl' }}
      style={{ position: 'relative' }}
    >
      {/* Terracotta radial glow */}
      <Box
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 50%, rgba(158, 90, 60, 0.06) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      <Container size="sm" style={{ position: 'relative', zIndex: 1 }}>
        <div ref={ref} className={`landing-step ${isVisible ? 'visible' : ''}`}>
          <Stack gap="xl" align="center" ta="center">
            <Title
              className="step-title"
              order={2}
              style={{
                fontSize: 'clamp(1.6rem, 4vw, 2.6rem)',
                color: 'var(--tribos-text-primary)',
                lineHeight: 1.15,
              }}
            >
              That's five minutes after signing up.
            </Title>

            <Text
              className="step-desc"
              size="lg"
              style={{
                color: 'var(--tribos-text-secondary)',
                maxWidth: 480,
                lineHeight: 1.6,
              }}
            >
              Connect your accounts, and the AI coach already knows what you should ride tomorrow.
            </Text>

            <Button
              className="step-content"
              component={Link}
              to="/auth"
              size="xl"
              color="terracotta"
              rightSection={<IconChevronRight size={20} />}
            >
              Create Free Account
            </Button>

            <Group className="step-content" gap="lg" justify="center" wrap="wrap">
              <Group gap={4}>
                <IconCheck size={14} color="var(--tribos-sage-500)" />
                <Text size="xs" style={{ color: 'var(--tribos-text-muted)', fontFamily: "'DM Mono', monospace" }}>
                  Free during beta
                </Text>
              </Group>
              <Group gap={4}>
                <IconCheck size={14} color="var(--tribos-sage-500)" />
                <Text size="xs" style={{ color: 'var(--tribos-text-muted)', fontFamily: "'DM Mono', monospace" }}>
                  No credit card
                </Text>
              </Group>
              <Group gap={4}>
                <IconCheck size={14} color="var(--tribos-sage-500)" />
                <Text size="xs" style={{ color: 'var(--tribos-text-muted)', fontFamily: "'DM Mono', monospace" }}>
                  Syncs with Strava & Garmin
                </Text>
              </Group>
            </Group>

            <Text
              size="sm"
              style={{
                color: 'var(--tribos-text-muted)',
                fontFamily: "'DM Mono', monospace",
              }}
            >
              Join 65+ cyclists already in the private beta
            </Text>
          </Stack>
        </div>
      </Container>
    </Box>
  );
}
