import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Box, Group, Text, Button, Anchor, Center, Container, Stack } from '@mantine/core';
import { IconRoute } from '@tabler/icons-react';
import SEO, { getOrganizationSchema, getWebSiteSchema } from '../components/SEO';

// Landing sections
import HeroSection from '../components/landing/HeroSection';
import ConnectStep from '../components/landing/ConnectStep';
import ImportStep from '../components/landing/ImportStep';
import AnalyzeStep from '../components/landing/AnalyzeStep';
import CoachStep from '../components/landing/CoachStep';
import RouteStep from '../components/landing/RouteStep';
import FinalCTA from '../components/landing/FinalCTA';
import ProgressIndicator from '../components/landing/ProgressIndicator';

// Styles
import '../components/landing/landing.css';

const SECTION_COUNT = 7;

function Landing() {
  const sectionRefs = useRef([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const setSectionRef = (index) => (el) => {
    sectionRefs.current[index] = el;
  };

  // Track which section is active via IntersectionObserver
  useEffect(() => {
    const observers = [];
    const visibilityMap = new Map();

    sectionRefs.current.forEach((el, index) => {
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          visibilityMap.set(index, entry.intersectionRatio);
          let maxRatio = 0;
          let maxIndex = 0;
          visibilityMap.forEach((ratio, idx) => {
            if (ratio > maxRatio) {
              maxRatio = ratio;
              maxIndex = idx;
            }
          });
          if (maxRatio > 0) {
            setActiveIndex(maxIndex);
          }
        },
        { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach(o => o.disconnect());
  }, []);

  return (
    <>
      <SEO
        title="tribos.studio - Cycling Route Builder, AI Coach & Training Platform"
        description="Build smarter cycling routes with AI, get personalized coaching from your ride history, and follow structured training plans. Syncs with Strava, Garmin, and Wahoo."
        keywords="cycling route builder, cycling route planner, AI cycling coach, cycling training platform, bike route builder, cycling training plans, strava route builder, garmin route sync, cycling analytics, cycling power analysis"
        url="https://tribos.studio"
        image="https://tribos.studio/og-image.svg"
        structuredData={{
          '@context': 'https://schema.org',
          '@graph': [getOrganizationSchema(), getWebSiteSchema()],
        }}
      />

      {/* Fixed navigation */}
      <Box className="landing-nav" py="sm" px={{ base: 'md', md: 'xl' }}>
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <IconRoute size={22} color="var(--tribos-terracotta-500)" />
            <Text
              fw={700}
              size="md"
              style={{
                color: 'var(--tribos-terracotta-500)',
                letterSpacing: '-0.02em',
                fontFamily: "'DM Mono', monospace",
              }}
            >
              tribos.studio
            </Text>
          </Group>
          <Button
            component={Link}
            to="/auth"
            size="sm"
            color="terracotta"
          >
            Create Free Account
          </Button>
        </Group>
      </Box>

      {/* Progress indicator (desktop only) */}
      <ProgressIndicator activeIndex={activeIndex} sectionRefs={sectionRefs} />

      {/* Page content */}
      <Box
        style={{
          background: `linear-gradient(180deg, var(--tribos-bg-primary) 0%, var(--tribos-bg-secondary) 50%, var(--tribos-bg-primary) 100%)`,
          minHeight: '100vh',
        }}
      >
        {/* Section 0: Hero */}
        <div ref={setSectionRef(0)}>
          <HeroSection />
        </div>

        {/* Section 1: Connect */}
        <div ref={setSectionRef(1)}>
          <ConnectStep />
        </div>

        {/* Section 2: Import */}
        <div ref={setSectionRef(2)}>
          <ImportStep />
        </div>

        {/* Section 3: Analyze */}
        <div ref={setSectionRef(3)}>
          <AnalyzeStep />
        </div>

        {/* Section 4: Coach */}
        <div ref={setSectionRef(4)}>
          <CoachStep />
        </div>

        {/* Section 5: Route */}
        <div ref={setSectionRef(5)}>
          <RouteStep />
        </div>

        {/* Section 6: CTA */}
        <div ref={setSectionRef(6)}>
          <FinalCTA />
        </div>

        {/* Footer */}
        <Box
          py={30}
          px={{ base: 'md', md: 'xl' }}
          style={{
            borderTop: '1px solid var(--tribos-border-default)',
          }}
        >
          <Container size="lg">
            <Stack gap="sm">
              <Center>
                <Group gap="md">
                  <IconRoute size={20} color="var(--tribos-terracotta-500)" />
                  <Text size="sm" style={{ color: 'var(--tribos-text-muted)' }}>
                    tribos.studio
                  </Text>
                </Group>
              </Center>
              <Center>
                <Group gap="lg">
                  <Anchor href="/privacy" size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                    Privacy
                  </Anchor>
                  <Anchor href="/terms" size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                    Terms
                  </Anchor>
                  <Anchor href="mailto:travis@tribos.studio" size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                    Contact
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
