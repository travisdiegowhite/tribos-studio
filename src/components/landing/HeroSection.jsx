import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Container, Title, Text, Button, Stack, Group, Box, Badge,
  SimpleGrid, Paper, ThemeIcon,
} from '@mantine/core';
import { IconChevronRight, IconChevronDown, IconSparkles, IconRobot } from '@tabler/icons-react';
import Map, { Source, Layer } from 'react-map-gl';
import { fullRoute, routeBounds } from './routeData';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export default function HeroSection() {
  const [hasScrolled, setHasScrolled] = useState(false);
  const [animatedCoords, setAnimatedCoords] = useState([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const animFrameRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 100) setHasScrolled(true);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Animate route drawing after map loads
  const animateRoute = useCallback(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setAnimatedCoords(fullRoute);
      return;
    }

    const totalPoints = fullRoute.length;
    const duration = 2500;
    const startTime = performance.now();

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 2);
      const pointCount = Math.max(2, Math.round(eased * totalPoints));
      setAnimatedCoords(fullRoute.slice(0, pointCount));

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        setAnimatedCoords(fullRoute);
      }
    };

    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    if (mapLoaded) animateRoute();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [mapLoaded, animateRoute]);

  const routeGeoJSON = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: animatedCoords.length >= 2 ? animatedCoords : fullRoute.slice(0, 2),
    },
  };

  const handleMapLoad = useCallback(() => setMapLoaded(true), []);

  return (
    <Box
      className="landing-hero"
      py={{ base: 60, md: 100 }}
      px={{ base: 'md', md: 'xl' }}
      style={{ minHeight: '90vh', display: 'flex', alignItems: 'center', position: 'relative' }}
    >
      {/* Subtle radial glow */}
      <Box
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 30% 40%, rgba(58, 90, 140, 0.06) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      <Container size="lg" style={{ position: 'relative', zIndex: 1, width: '100%' }}>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" verticalSpacing="xl" style={{ alignItems: 'center' }}>

          {/* Left column: text + CTA */}
          <Stack gap="xl" ta={{ base: 'center', md: 'left' }} align={{ base: 'center', md: 'flex-start' }}>
            <Badge color="terracotta" variant="light" size="lg">
              Now in Private Beta
            </Badge>

            <Title
              order={1}
              style={{
                fontSize: 'clamp(1.8rem, 4vw, 3rem)',
                color: 'var(--tribos-text-primary)',
                lineHeight: 1.15,
                maxWidth: 520,
              }}
            >
              You have the plan. You have the gear.{' '}
              <span style={{ color: 'var(--tribos-terracotta-500)' }}>
                But who tells you what to ride today?
              </span>
            </Title>

            <Text
              size="lg"
              style={{
                color: 'var(--tribos-text-secondary)',
                maxWidth: 460,
                lineHeight: 1.6,
              }}
            >
              Watch what happens when your cycling data meets an AI that actually understands training.
            </Text>

            <Group gap="md" justify={{ base: 'center', md: 'flex-start' }}>
              <Button
                component={Link}
                to="/auth"
                size="lg"
                color="terracotta"
                rightSection={<IconChevronRight size={18} />}
              >
                Create Free Account
              </Button>
            </Group>

            <Box
              component="a"
              href="#connect"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('connect')?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{ textDecoration: 'none', cursor: 'pointer' }}
            >
              <Text
                size="sm"
                style={{
                  color: 'var(--tribos-text-muted)',
                  fontFamily: "'DM Mono', monospace",
                  letterSpacing: '1px',
                }}
              >
                See how it works
              </Text>
            </Box>
          </Stack>

          {/* Right column: Map + Coach overlay */}
          <Box style={{ position: 'relative' }}>
            <Paper
              p={0}
              style={{
                overflow: 'hidden',
                height: 420,
                border: '1.5px solid var(--tribos-border-default)',
              }}
            >
              {MAPBOX_TOKEN ? (
                <Map
                  mapboxAccessToken={MAPBOX_TOKEN}
                  initialViewState={{
                    bounds: routeBounds,
                    fitBoundsOptions: { padding: 40 },
                  }}
                  style={{ width: '100%', height: '100%' }}
                  mapStyle="mapbox://styles/mapbox/dark-v11"
                  interactive={false}
                  attributionControl={false}
                  onLoad={handleMapLoad}
                >
                  {animatedCoords.length >= 2 && (
                    <Source id="hero-route" type="geojson" data={routeGeoJSON}>
                      <Layer
                        id="hero-route-shadow"
                        type="line"
                        paint={{
                          'line-color': '#3A5A8C',
                          'line-width': 8,
                          'line-opacity': 0.15,
                          'line-blur': 6,
                        }}
                      />
                      <Layer
                        id="hero-route-line"
                        type="line"
                        paint={{
                          'line-color': '#3A5A8C',
                          'line-width': 3,
                          'line-opacity': 0.9,
                        }}
                        layout={{
                          'line-cap': 'round',
                          'line-join': 'round',
                        }}
                      />
                    </Source>
                  )}
                </Map>
              ) : (
                <Box
                  style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'var(--tribos-bg-tertiary)',
                  }}
                >
                  <Text size="sm" c="dimmed">Map preview</Text>
                </Box>
              )}
            </Paper>

            {/* Coach chat overlay */}
            <Paper
              p="sm"
              style={{
                position: 'absolute',
                bottom: 12,
                left: 12,
                right: 12,
                maxWidth: 340,
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                background: 'color-mix(in srgb, var(--tribos-bg-secondary) 88%, transparent)',
                border: '1px solid var(--tribos-border-default)',
              }}
            >
              {/* Chat header */}
              <Group gap="sm" mb="xs">
                <ThemeIcon color="terracotta" variant="light" size="xs">
                  <IconSparkles size={10} />
                </ThemeIcon>
                <Text fw={600} size="xs" style={{ color: 'var(--tribos-text-primary)' }}>
                  AI Coach
                </Text>
                <Box
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: 'var(--tribos-sage-500)',
                    marginLeft: -4,
                  }}
                />
              </Group>

              {/* User message */}
              <Box mb={8} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Paper
                  px="xs"
                  py={6}
                  style={{
                    backgroundColor: 'var(--tribos-input, var(--tribos-bg-tertiary))',
                    border: '1px solid var(--tribos-border-default)',
                  }}
                >
                  <Text size="xs" style={{ color: 'var(--tribos-text-primary)', lineHeight: 1.4 }}>
                    I have 90 min before work. What should I ride?
                  </Text>
                </Paper>
              </Box>

              {/* Coach response */}
              <Group gap={6} align="flex-start">
                <ThemeIcon color="terracotta" variant="light" size="xs" mt={2}>
                  <IconRobot size={10} />
                </ThemeIcon>
                <Paper
                  px="xs"
                  py={6}
                  style={{
                    flex: 1,
                    backgroundColor: 'var(--tribos-terracotta-surface)',
                    border: '1px solid var(--tribos-terracotta-border)',
                  }}
                >
                  <Text size="xs" style={{ color: 'var(--tribos-text-primary)', lineHeight: 1.4 }}>
                    Your CTL is 62 and you rested yesterday — you're fresh. I'd suggest the Hygiene Loop at ~195W. Endurance pace, keep it easy.
                  </Text>
                </Paper>
              </Group>
            </Paper>
          </Box>
        </SimpleGrid>
      </Container>

      {/* Scroll prompt */}
      <Box
        className={`scroll-prompt ${hasScrolled ? 'hidden' : ''}`}
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          textAlign: 'center',
          cursor: 'pointer',
        }}
        onClick={() => {
          document.getElementById('connect')?.scrollIntoView({ behavior: 'smooth' });
        }}
      >
        <IconChevronDown size={24} color="var(--tribos-text-muted)" />
      </Box>
    </Box>
  );
}
