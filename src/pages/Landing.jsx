import { Link } from 'react-router-dom';
import { Container, Title, Text, Button, Stack, Group, Box } from '@mantine/core';
import { tokens } from '../theme';

function Landing() {
  return (
    <Box
      style={{
        minHeight: '100vh',
        backgroundColor: tokens.colors.bgPrimary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Container size="md" style={{ textAlign: 'center' }}>
        <Stack gap="xl">
          <Box>
            <Text
              size="lg"
              fw={600}
              style={{ color: tokens.colors.electricLime, letterSpacing: '0.1em' }}
              mb="md"
            >
              TRIBOS.STUDIO
            </Text>
            <Title
              order={1}
              style={{
                fontSize: 'clamp(2.5rem, 5vw, 4rem)',
                color: tokens.colors.textPrimary,
                lineHeight: 1.1,
              }}
            >
              Train smarter.
              <br />
              <span style={{ color: tokens.colors.electricLime }}>Ride stronger.</span>
            </Title>
          </Box>

          <Text
            size="xl"
            style={{ color: tokens.colors.textSecondary, maxWidth: 500, margin: '0 auto' }}
          >
            The cycling training platform that connects your devices, plans your routes, and optimizes your performance.
          </Text>

          <Group justify="center" gap="md">
            <Button
              component={Link}
              to="/auth"
              size="lg"
              color="lime"
              style={{ fontWeight: 600 }}
            >
              Get Started
            </Button>
            <Button
              component={Link}
              to="/auth"
              size="lg"
              variant="outline"
              color="lime"
            >
              Sign In
            </Button>
          </Group>

          <Group justify="center" gap="xl" mt="xl">
            <FeatureItem icon="🗺️" label="Route Builder" />
            <FeatureItem icon="📊" label="Training Analytics" />
            <FeatureItem icon="🔗" label="Device Sync" />
          </Group>
        </Stack>
      </Container>
    </Box>
  );
}

function FeatureItem({ icon, label }) {
  return (
    <Stack gap="xs" align="center">
      <Text size="2rem">{icon}</Text>
      <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
        {label}
      </Text>
    </Stack>
  );
}

export default Landing;
