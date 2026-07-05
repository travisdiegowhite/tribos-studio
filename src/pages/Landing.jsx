import { Link } from 'react-router-dom';
import { Box, Group, Text, Button, Anchor, Center, Container, Stack } from '@mantine/core';
import SEO, { getOrganizationSchema, getWebSiteSchema } from '../components/SEO';

// Landing sections — a short "about" page. The product itself is the front
// door (/ lands guests in the route builder); this page lives at /welcome
// for anyone who wants the pitch.
import HeroSection from '../components/landing/HeroSection';
import FeatureCards from '../components/landing/FeatureCards';
import FinalCTA from '../components/landing/FinalCTA';

// Styles
import '../components/landing/landing.css';
import { Path } from '@phosphor-icons/react';

function Landing() {
  return (
    <>
      <SEO
        title="tribos.studio - Cycling Route Builder, Coach & Training Platform"
        description="tribos is an AI route builder and cycling coach. Build routes free with no account; create a free account to sync Strava, Garmin, or Wahoo and get coaching from your real ride history."
        keywords="cycling route builder, cycling route planner, cycling coach, cycling training platform, bike route builder, cycling training plans, strava route builder, garmin route sync, cycling analytics, cycling power analysis"
        url="https://tribos.studio/welcome"
        image="https://tribos.studio/og-image.svg"
        structuredData={{
          '@context': 'https://schema.org',
          '@graph': [getOrganizationSchema(), getWebSiteSchema()],
        }}
      />

      {/* Fixed navigation */}
      <Box className="landing-nav" py="sm" px={{ base: 'md', md: 'xl' }}>
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Path size={22} color="var(--color-teal)" />
            <Text
              fw={700}
              size="md"
              style={{
                color: 'var(--color-teal)',
                letterSpacing: '-0.02em',
                fontFamily: "'DM Mono', monospace",
              }}
            >
              tribos.studio
            </Text>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Button
              component={Link}
              to="/auth"
              size="sm"
              variant="subtle"
              color="teal"
              visibleFrom="sm"
            >
              Log in
            </Button>
            <Button
              component={Link}
              to="/auth"
              state={{ fromBetaSignup: true }}
              size="sm"
              color="teal"
            >
              Create Free Account
            </Button>
          </Group>
        </Group>
      </Box>

      {/* Page content */}
      <Box
        style={{
          background: 'var(--color-bg)',
          minHeight: '100vh',
        }}
      >
        <HeroSection />
        <FeatureCards />
        <FinalCTA />

        {/* Footer */}
        <Box
          py={30}
          px={{ base: 'md', md: 'xl' }}
          style={{
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <Container size="lg">
            <Stack gap="sm">
              <Center>
                <Group gap="md">
                  <Path size={20} color="var(--color-teal)" />
                  <Text size="sm" style={{ color: 'var(--color-text-muted)' }}>
                    tribos.studio
                  </Text>
                </Group>
              </Center>
              <Center>
                <Group gap="lg">
                  <Anchor href="/privacy" size="xs" style={{ color: 'var(--color-text-muted)' }}>
                    Privacy
                  </Anchor>
                  <Anchor href="/terms" size="xs" style={{ color: 'var(--color-text-muted)' }}>
                    Terms
                  </Anchor>
                  <Anchor href="mailto:travis@tribos.studio" size="xs" style={{ color: 'var(--color-text-muted)' }}>
                    Contact
                  </Anchor>
                  <Anchor href="mailto:travis@tribos.studio?subject=Abuse%20Report" size="xs" style={{ color: 'var(--color-text-muted)' }}>
                    Report Abuse
                  </Anchor>
                </Group>
              </Center>
            </Stack>
          </Container>
        </Box>
      </Box>
    </>
  );
}

export default Landing;
