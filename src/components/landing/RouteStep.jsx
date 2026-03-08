import { useState, useEffect, useRef, useCallback } from 'react';
import { Container, Text, Paper, Group, Button, SimpleGrid, Box, Stack } from '@mantine/core';
import { IconRuler, IconMountain, IconClock, IconActivity, IconDownload } from '@tabler/icons-react';
import Map, { Source, Layer } from 'react-map-gl';
import { useScrollReveal, usePrefersReducedMotion } from './useScrollReveal';
import { fullRoute, routeBounds } from './routeData';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const routeStats = [
  { icon: IconRuler, label: 'Distance', value: '50.6 mi', color: 'var(--color-teal)' },
  { icon: IconMountain, label: 'Elevation', value: '1,840 ft', color: 'var(--color-coral)' },
  { icon: IconClock, label: 'Est. Time', value: '2h 55m', color: 'var(--tribos-teal-500)' },
  { icon: IconActivity, label: 'Workout', value: 'SS 3\u00d715', color: 'var(--tribos-mauve-500)' },
];

export default function RouteStep() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.15 });
  const reducedMotion = usePrefersReducedMotion();
  const [animatedCoords, setAnimatedCoords] = useState([]);
  const [showStats, setShowStats] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const animFrameRef = useRef(null);
  const mapRef = useRef(null);

  const animateRoute = useCallback(() => {
    if (reducedMotion) {
      setAnimatedCoords(fullRoute);
      setShowStats(true);
      return;
    }

    const totalPoints = fullRoute.length;
    const duration = 3000; // 3 seconds
    const startTime = performance.now();

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out
      const eased = 1 - Math.pow(1 - progress, 2);
      const pointCount = Math.max(2, Math.round(eased * totalPoints));
      setAnimatedCoords(fullRoute.slice(0, pointCount));

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        setAnimatedCoords(fullRoute);
        setTimeout(() => setShowStats(true), 300);
      }
    };

    animFrameRef.current = requestAnimationFrame(step);
  }, [reducedMotion]);

  useEffect(() => {
    if (isVisible && mapLoaded) {
      animateRoute();
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isVisible, mapLoaded, animateRoute]);

  const routeGeoJSON = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: animatedCoords.length >= 2 ? animatedCoords : fullRoute.slice(0, 2),
    },
  };

  const handleMapLoad = useCallback(() => {
    setMapLoaded(true);
  }, []);

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
                  color: 'var(--color-teal)',
                  marginBottom: 8,
                }}
              >
                Step 05 — Ride
              </Text>
              <Text
                className="step-title"
                ta="center"
                style={{
                  fontSize: 'clamp(1.4rem, 3.5vw, 2.2rem)',
                  fontFamily: "'Anybody', sans-serif",
                  fontWeight: 800,
                  color: 'var(--color-text-primary)',
                }}
              >
                Route built. Sent to your Garmin.
              </Text>
            </div>

            <Paper className="step-content" p={0} style={{ width: '100%', overflow: 'hidden' }}>
              {/* Map */}
              <Box style={{ height: 360, position: 'relative' }}>
                {MAPBOX_TOKEN ? (
                  <Map
                    ref={mapRef}
                    mapboxAccessToken={MAPBOX_TOKEN}
                    initialViewState={{
                      bounds: routeBounds,
                      fitBoundsOptions: { padding: 50 },
                    }}
                    style={{ width: '100%', height: '100%' }}
                    mapStyle="mapbox://styles/mapbox/dark-v11"
                    interactive={false}
                    attributionControl={false}
                    onLoad={handleMapLoad}
                  >
                    {animatedCoords.length >= 2 && (
                      <Source id="route" type="geojson" data={routeGeoJSON}>
                        {/* Route glow/shadow */}
                        <Layer
                          id="route-shadow"
                          type="line"
                          paint={{
                            'line-color': '#2A8C82',
                            'line-width': 8,
                            'line-opacity': 0.15,
                            'line-blur': 6,
                          }}
                        />
                        {/* Route line */}
                        <Layer
                          id="route-line"
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
              </Box>

              {/* Route stats */}
              <Box p="md">
                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
                  {routeStats.map((stat) => (
                    <Group
                      key={stat.label}
                      gap="xs"
                      className={`route-stats-row ${showStats ? 'visible' : ''}`}
                    >
                      <stat.icon size={16} color={stat.color} />
                      <div>
                        <Text size="xs" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                          {stat.label}
                        </Text>
                        <Text size="sm" fw={600} style={{ fontFamily: "'DM Mono', monospace", color: 'var(--color-text-primary)' }}>
                          {stat.value}
                        </Text>
                      </div>
                    </Group>
                  ))}
                </SimpleGrid>

                {/* Export buttons */}
                <Group
                  mt="md"
                  gap="sm"
                  className={`route-stats-row ${showStats ? 'visible' : ''}`}
                  style={{ transitionDelay: '0.2s' }}
                >
                  <Button
                    color="teal"
                    size="sm"
                    leftSection={<IconDownload size={14} />}
                    style={{ pointerEvents: 'none' }}
                  >
                    Export to Garmin
                  </Button>
                  <Button
                    variant="light"
                    color="gray"
                    size="sm"
                    style={{ pointerEvents: 'none' }}
                  >
                    GPX
                  </Button>
                  <Button
                    variant="light"
                    color="gray"
                    size="sm"
                    style={{ pointerEvents: 'none' }}
                  >
                    TCX
                  </Button>
                </Group>
              </Box>
            </Paper>
          </Stack>
        </div>
      </Container>
    </Box>
  );
}
