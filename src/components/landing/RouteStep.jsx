import { useState, useEffect, useRef, useCallback } from 'react';
import { Container, Text, Paper, Group, Button, SimpleGrid, Box, Stack } from '@mantine/core';
import { IconRuler, IconMountain, IconClock, IconActivity, IconDownload } from '@tabler/icons-react';
import Map, { Source, Layer } from 'react-map-gl';
import { useScrollReveal, usePrefersReducedMotion } from './useScrollReveal';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// ~42-mile loop: Hygiene → north toward Lyons → west through foothills →
// south through Niwot → east back to Longmont → return to Hygiene
// Realistic roads: N 75th St, Hygiene Rd, Apple Valley Rd, US-36, Niwot Rd
const fullRoute = [
  [-105.1857, 40.2069], // Start: Hygiene area
  [-105.1857, 40.2180], // North on N 75th St
  [-105.1900, 40.2300], // Continue north
  [-105.2050, 40.2380], // Northwest on Hygiene Rd
  [-105.2250, 40.2420], // Continue west
  [-105.2450, 40.2500], // Approaching Apple Valley
  [-105.2600, 40.2520], // Apple Valley Rd
  [-105.2750, 40.2460], // Curve south toward Lyons area
  [-105.2800, 40.2350], // South on US-36 corridor
  [-105.2700, 40.2220], // Continue south
  [-105.2600, 40.2100], // Left Hand Canyon area
  [-105.2500, 40.2000], // Continue south
  [-105.2400, 40.1900], // Approaching Niwot
  [-105.2200, 40.1800], // East through Niwot
  [-105.2000, 40.1750], // Continue east on Niwot Rd
  [-105.1800, 40.1720], // Continue east
  [-105.1600, 40.1750], // Heading northeast
  [-105.1450, 40.1850], // Nelson Rd area
  [-105.1400, 40.1950], // Continue north
  [-105.1450, 40.2050], // Northwest toward Longmont
  [-105.1550, 40.2100], // Continue northwest
  [-105.1700, 40.2080], // West back toward start
  [-105.1857, 40.2069], // Return to start
];

// Bounds for initial map view
const routeBounds = [
  [Math.min(...fullRoute.map(c => c[0])) - 0.01, Math.min(...fullRoute.map(c => c[1])) - 0.01],
  [Math.max(...fullRoute.map(c => c[0])) + 0.01, Math.max(...fullRoute.map(c => c[1])) + 0.01],
];

const routeStats = [
  { icon: IconRuler, label: 'Distance', value: '42 mi', color: 'var(--tribos-terracotta-500)' },
  { icon: IconMountain, label: 'Elevation', value: '2,230 ft', color: 'var(--tribos-gold-500)' },
  { icon: IconClock, label: 'Est. Time', value: '2h 15m', color: 'var(--tribos-teal-500)' },
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
                  color: 'var(--tribos-terracotta-500)',
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
                  color: 'var(--tribos-text-primary)',
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
                            'line-color': '#9E5A3C',
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
                            'line-color': '#9E5A3C',
                            'line-width': 3,
                            'line-opacity': 0.9,
                          }}
                          layout={{
                            'line-cap': 'round',
                            'line-join': 'round',
                          }}
                        />
                        {/* Start/end dot */}
                        {animatedCoords.length === fullRoute.length && (
                          <Layer
                            id="route-start"
                            type="circle"
                            filter={['==', '$type', 'Point']}
                            paint={{
                              'circle-radius': 5,
                              'circle-color': '#9E5A3C',
                              'circle-stroke-width': 2,
                              'circle-stroke-color': '#ffffff',
                            }}
                          />
                        )}
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
                        <Text size="xs" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                          {stat.label}
                        </Text>
                        <Text size="sm" fw={600} style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-primary)' }}>
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
                    color="terracotta"
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
