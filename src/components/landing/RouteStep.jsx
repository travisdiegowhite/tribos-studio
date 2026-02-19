import { useState, useEffect, useRef, useCallback } from 'react';
import { Container, Text, Paper, Group, Button, SimpleGrid, Box, Stack } from '@mantine/core';
import { IconRuler, IconMountain, IconClock, IconActivity, IconDownload } from '@tabler/icons-react';
import Map, { Source, Layer } from 'react-map-gl';
import { useScrollReveal, usePrefersReducedMotion } from './useScrollReveal';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// ~42-mile loop: Hygiene → Hygiene Rd west → Apple Valley → south past Lyons →
// Left Hand Canyon Dr → Niwot → Nelson Rd rollers → N 75th St → back to Hygiene
// Roads: N 75th St, Hygiene Rd, Apple Valley Rd, US-36, Left Hand Canyon Dr,
// Niwot Rd, Nelson Rd, N 83rd St, Ute Hwy
const fullRoute = [
  [-105.1857, 40.2069], // Start: Hygiene — N 75th St & Hygiene Rd
  [-105.1857, 40.2110], // North on N 75th St
  [-105.1860, 40.2155], // Curve on 75th
  [-105.1870, 40.2200], // 75th heading north
  [-105.1890, 40.2260], // Approaching Hygiene Rd turn
  [-105.1935, 40.2300], // West on Hygiene Rd
  [-105.1990, 40.2330], // Hygiene Rd gentle curve
  [-105.2060, 40.2355], // Continue west
  [-105.2140, 40.2380], // Rolling terrain
  [-105.2220, 40.2405], // Past Pella Crossing
  [-105.2300, 40.2420], // Approaching Apple Valley Rd
  [-105.2380, 40.2450], // Northwest on Apple Valley
  [-105.2460, 40.2480], // Apple Valley climbing
  [-105.2530, 40.2510], // Approaching foothills
  [-105.2600, 40.2520], // Apple Valley high point
  [-105.2670, 40.2500], // Curve south
  [-105.2720, 40.2460], // Descending toward US-36
  [-105.2760, 40.2410], // Approach US-36
  [-105.2790, 40.2350], // South on US-36 corridor
  [-105.2770, 40.2280], // Continue south
  [-105.2740, 40.2210], // Rolling south
  [-105.2700, 40.2150], // Past Altona area
  [-105.2660, 40.2090], // Approaching Left Hand Canyon
  [-105.2610, 40.2030], // Left Hand Canyon Dr
  [-105.2550, 40.1975], // Continue east on Left Hand Canyon
  [-105.2480, 40.1930], // Rolling terrain
  [-105.2400, 40.1890], // East past Buckingham Park
  [-105.2310, 40.1850], // Approaching Niwot
  [-105.2220, 40.1815], // Niwot Rd junction
  [-105.2130, 40.1790], // East through Niwot
  [-105.2040, 40.1770], // Past Niwot center
  [-105.1950, 40.1750], // Continue east on Niwot Rd
  [-105.1860, 40.1735], // East toward Longmont
  [-105.1780, 40.1725], // Niwot Rd straightaway
  [-105.1700, 40.1730], // Approaching Nelson Rd
  [-105.1630, 40.1755], // Turn north — Nelson Rd
  [-105.1570, 40.1800], // Nelson Rd rollers — sweet spot zone
  [-105.1520, 40.1850], // Climbing roller
  [-105.1480, 40.1900], // Nelson Rd north
  [-105.1450, 40.1950], // Continue north
  [-105.1430, 40.2000], // Past Ute Hwy
  [-105.1460, 40.2040], // Curve northwest on N 83rd St
  [-105.1510, 40.2070], // N 83rd heading northwest
  [-105.1570, 40.2085], // Approaching 75th
  [-105.1640, 40.2080], // West on connecting road
  [-105.1720, 40.2075], // Heading back west
  [-105.1790, 40.2070], // Almost home
  [-105.1857, 40.2069], // Return to start — Hygiene
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
