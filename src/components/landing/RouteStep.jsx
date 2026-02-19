import { useState, useEffect, useRef, useCallback } from 'react';
import { Container, Text, Paper, Group, Button, SimpleGrid, Box, Stack } from '@mantine/core';
import { IconRuler, IconMountain, IconClock, IconActivity, IconDownload } from '@tabler/icons-react';
import Map, { Source, Layer } from 'react-map-gl';
import { useScrollReveal, usePrefersReducedMotion } from './useScrollReveal';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Erie Gravel/Unpaved Cycling — 50.6 mi loop, Feb 14
// Counterclockwise: Erie → north through ag roads → west to Hygiene/Lyons corridor →
// south through foothills open space → Niwot → east through South Boulder Creek trail →
// northeast on gravel county roads → back to Erie
// Mix of gravel county roads, dirt farm roads, and paved connectors
const fullRoute = [
  // Start: Erie — near County Line Rd & Erie Pkwy
  [-105.0498, 40.0505],
  [-105.0500, 40.0540],
  [-105.0505, 40.0580],
  [-105.0510, 40.0625],
  // North on gravel county roads through farmland
  [-105.0515, 40.0670],
  [-105.0518, 40.0720],
  [-105.0522, 40.0775],
  [-105.0528, 40.0830],
  [-105.0535, 40.0890],
  [-105.0540, 40.0945],
  // Heading north-northwest toward Longmont
  [-105.0555, 40.1000],
  [-105.0572, 40.1055],
  [-105.0590, 40.1108],
  [-105.0610, 40.1160],
  [-105.0635, 40.1215],
  [-105.0660, 40.1268],
  [-105.0688, 40.1320],
  // Northwest through open prairie — gravel roads
  [-105.0720, 40.1370],
  [-105.0758, 40.1418],
  [-105.0800, 40.1465],
  [-105.0845, 40.1510],
  [-105.0895, 40.1555],
  [-105.0948, 40.1598],
  // Continuing northwest toward Longmont south side
  [-105.1005, 40.1640],
  [-105.1060, 40.1680],
  [-105.1118, 40.1718],
  [-105.1178, 40.1755],
  [-105.1235, 40.1790],
  // West through south Longmont on trails
  [-105.1295, 40.1820],
  [-105.1360, 40.1848],
  [-105.1425, 40.1870],
  [-105.1490, 40.1888],
  [-105.1555, 40.1902],
  // Northwest toward Hygiene — gravel roads
  [-105.1618, 40.1925],
  [-105.1680, 40.1952],
  [-105.1738, 40.1985],
  [-105.1790, 40.2020],
  [-105.1835, 40.2058],
  [-105.1860, 40.2098],
  // Hygiene area — west on Hygiene Rd
  [-105.1880, 40.2138],
  [-105.1905, 40.2175],
  [-105.1945, 40.2208],
  [-105.1998, 40.2235],
  [-105.2058, 40.2258],
  [-105.2125, 40.2275],
  [-105.2195, 40.2288],
  // West past Pella Crossing toward Apple Valley
  [-105.2265, 40.2295],
  [-105.2335, 40.2298],
  [-105.2405, 40.2295],
  [-105.2470, 40.2288],
  // South turn — heading toward Left Hand Canyon
  [-105.2528, 40.2270],
  [-105.2575, 40.2245],
  [-105.2610, 40.2212],
  [-105.2638, 40.2175],
  [-105.2658, 40.2135],
  [-105.2670, 40.2092],
  // South through foothills corridor
  [-105.2672, 40.2048],
  [-105.2668, 40.2002],
  [-105.2655, 40.1958],
  [-105.2635, 40.1915],
  [-105.2608, 40.1875],
  // Southeast through Left Hand Canyon area
  [-105.2575, 40.1838],
  [-105.2535, 40.1805],
  [-105.2490, 40.1775],
  [-105.2440, 40.1750],
  [-105.2388, 40.1728],
  // East through Niwot on gravel/farm roads
  [-105.2330, 40.1710],
  [-105.2268, 40.1695],
  [-105.2205, 40.1682],
  [-105.2140, 40.1672],
  [-105.2072, 40.1665],
  [-105.2005, 40.1660],
  // Continue east — South Boulder Creek trail area
  [-105.1935, 40.1655],
  [-105.1868, 40.1648],
  [-105.1800, 40.1640],
  [-105.1732, 40.1630],
  [-105.1665, 40.1618],
  [-105.1598, 40.1602],
  // Southeast on gravel county roads toward Erie
  [-105.1535, 40.1582],
  [-105.1475, 40.1558],
  [-105.1418, 40.1530],
  [-105.1365, 40.1498],
  [-105.1315, 40.1462],
  [-105.1270, 40.1422],
  // South through open farmland
  [-105.1230, 40.1378],
  [-105.1195, 40.1332],
  [-105.1165, 40.1282],
  [-105.1138, 40.1230],
  [-105.1115, 40.1178],
  [-105.1095, 40.1125],
  // Heading southeast toward Erie
  [-105.1078, 40.1070],
  [-105.1060, 40.1015],
  [-105.1040, 40.0960],
  [-105.1018, 40.0908],
  [-105.0992, 40.0858],
  [-105.0962, 40.0810],
  // East-southeast on gravel back roads
  [-105.0928, 40.0768],
  [-105.0890, 40.0728],
  [-105.0848, 40.0692],
  [-105.0802, 40.0660],
  [-105.0755, 40.0632],
  [-105.0705, 40.0608],
  // Final approach back to Erie
  [-105.0655, 40.0588],
  [-105.0608, 40.0570],
  [-105.0562, 40.0548],
  [-105.0520, 40.0525],
  [-105.0498, 40.0505], // Return to start
];

// Bounds for initial map view
const routeBounds = [
  [Math.min(...fullRoute.map(c => c[0])) - 0.015, Math.min(...fullRoute.map(c => c[1])) - 0.015],
  [Math.max(...fullRoute.map(c => c[0])) + 0.015, Math.max(...fullRoute.map(c => c[1])) + 0.015],
];

const routeStats = [
  { icon: IconRuler, label: 'Distance', value: '50.6 mi', color: 'var(--tribos-terracotta-500)' },
  { icon: IconMountain, label: 'Elevation', value: '1,840 ft', color: 'var(--tribos-gold-500)' },
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
