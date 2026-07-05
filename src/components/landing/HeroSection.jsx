import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Container, Title, Text, Button, Stack, Group, Box,
  SimpleGrid, Paper,
} from '@mantine/core';
import Map, { Source, Layer } from 'react-map-gl';
import { fullRoute, routeBounds } from './routeData';
import { CaretRight, Robot, Sparkle } from '@phosphor-icons/react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export default function HeroSection() {
  const [animatedCoords, setAnimatedCoords] = useState([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const animFrameRef = useRef(null);

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
      style={{ minHeight: '80vh', display: 'flex', alignItems: 'center' }}
    >
      <Container size="lg" style={{ width: '100%' }}>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" verticalSpacing="xl" style={{ alignItems: 'center' }}>

          {/* Left column: text + CTA */}
          <Stack gap="xl" ta={{ base: 'center', md: 'left' }} align={{ base: 'center', md: 'flex-start' }}>
            <Text
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
              }}
            >
              Tribos — Cycling Intelligence
            </Text>

            <Title
              order={1}
              style={{
                fontSize: 'clamp(2rem, 4.5vw, 3.2rem)',
                color: 'var(--color-text-primary)',
                lineHeight: 1.1,
                maxWidth: 520,
              }}
            >
              A route builder{' '}
              <span style={{ color: 'var(--color-teal)' }}>
                with a coach behind it.
              </span>
            </Title>

            <Text
              size="lg"
              style={{
                color: 'var(--color-text-secondary)',
                maxWidth: 460,
                lineHeight: 1.6,
              }}
            >
              tribos builds cycling routes from real roads and real gravel — and,
              once you connect your rides, tells you in plain language what to
              ride today. The builder is free to try, no account needed.
            </Text>

            <Group gap="md" justify={{ base: 'center', md: 'flex-start' }}>
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

            <Text
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
              }}
            >
              Free to try — no account needed
            </Text>
          </Stack>

          {/* Right column: Map + Coach overlay */}
          <Box style={{ position: 'relative' }}>
            <Paper
              p={0}
              style={{
                overflow: 'hidden',
                height: 420,
                border: '1.5px solid var(--color-border)',
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
                          'line-color': '#2A8C82',
                          'line-width': 8,
                          'line-opacity': 0.15,
                          'line-blur': 6,
                        }}
                      />
                      <Layer
                        id="hero-route-line"
                        type="line"
                        paint={{
                          'line-color': '#2A8C82',
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
                    backgroundColor: 'var(--color-bg-secondary)',
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
                background: 'var(--tribos-card)',
                border: '1px solid var(--color-border)',
              }}
            >
              {/* Chat header */}
              <Group gap="sm" mb="xs">
                <Sparkle size={12} color="var(--color-teal)" />
                <Text fw={600} size="xs" style={{ color: 'var(--color-text-primary)' }}>
                  Coach
                </Text>
                <Box
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-gold)',
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
                    backgroundColor: 'var(--tribos-input, var(--color-bg-secondary))',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <Text size="xs" style={{ color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
                    I have 90 min before work. What should I ride?
                  </Text>
                </Paper>
              </Box>

              {/* Coach response */}
              <Group gap={6} align="flex-start" wrap="nowrap">
                <Robot size={12} color="var(--color-teal)" style={{ marginTop: 4, flexShrink: 0 }} />
                <Paper
                  px="xs"
                  py={6}
                  style={{
                    flex: 1,
                    backgroundColor: 'var(--tribos-terracotta-surface)',
                    border: '1px solid var(--tribos-terracotta-border)',
                  }}
                >
                  <Text size="xs" style={{ color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
                    You're fresh — form is trending up. I'd suggest the Hygiene
                    Loop at endurance pace. Keep it easy.
                  </Text>
                </Paper>
              </Group>
            </Paper>
          </Box>
        </SimpleGrid>
      </Container>
    </Box>
  );
}
