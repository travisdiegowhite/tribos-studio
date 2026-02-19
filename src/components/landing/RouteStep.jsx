import { useState, useEffect, useRef, useCallback } from 'react';
import { Container, Text, Paper, Group, Button, SimpleGrid, Box, Stack } from '@mantine/core';
import { IconRuler, IconMountain, IconClock, IconActivity, IconDownload } from '@tabler/icons-react';
import Map, { Source, Layer } from 'react-map-gl';
import { useScrollReveal, usePrefersReducedMotion } from './useScrollReveal';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Real Strava polyline — Erie Gravel/Unpaved loop, Feb 14
// ~50 mi counterclockwise: Erie → south through foothills to Superior → west to
// Coal Creek Canyon → north to Hygiene/Lyons corridor → east on gravel county roads → Erie
const fullRoute = [
  [-105.05817, 40.02936],
  [-105.04443, 40.02934],
  [-105.04261, 40.02810],
  [-105.04252, 40.02635],
  [-105.04387, 40.02307],
  [-105.04500, 40.02158],
  [-105.04581, 40.02102],
  [-105.04492, 40.02058],
  [-105.04423, 40.01937],
  [-105.04513, 40.01888],
  [-105.04594, 40.01993],
  [-105.04875, 40.01921],
  [-105.05104, 40.01840],
  [-105.05249, 40.01763],
  [-105.05178, 40.01595],
  [-105.05122, 40.01374],
  [-105.05143, 40.01276],
  [-105.05240, 40.01173],
  [-105.05239, 40.00968],
  [-105.05294, 40.00875],
  [-105.05468, 40.00750],
  [-105.05542, 40.00581],
  [-105.05629, 40.00261],
  [-105.05764, 40.00188],
  [-105.05861, 40.00045],
  [-105.05743, 39.99952],
  [-105.05639, 39.99803],
  [-105.05613, 39.99716],
  [-105.05682, 39.99644],
  [-105.05532, 39.99505],
  [-105.05556, 39.99420],
  [-105.05617, 39.99207],
  [-105.05849, 39.98977],
  [-105.06079, 39.98782],
  [-105.06114, 39.98717],
  [-105.06181, 39.98622],
  [-105.06281, 39.98520],
  [-105.06332, 39.98466],
  [-105.06475, 39.98458],
  [-105.06618, 39.98458],
  [-105.06805, 39.98203],
  [-105.06816, 39.98116],
  [-105.07040, 39.98056],
  [-105.07191, 39.98010],
  [-105.07290, 39.97709],
  [-105.07421, 39.97661],
  [-105.07534, 39.97632],
  [-105.07689, 39.97585],
  [-105.07671, 39.97481],
  [-105.07846, 39.97367],
  [-105.08030, 39.97292],
  [-105.08100, 39.97172],
  [-105.08253, 39.96829],
  [-105.08342, 39.96743],
  [-105.08590, 39.96281],
  [-105.08643, 39.96003],
  [-105.08542, 39.95913],
  [-105.08584, 39.95749],
  [-105.08593, 39.95615],
  [-105.08585, 39.95441],
  [-105.08757, 39.95342],
  [-105.08915, 39.95040],
  [-105.08855, 39.94850],
  [-105.08928, 39.94648],
  [-105.08970, 39.94541],
  [-105.08715, 39.94420],
  [-105.08605, 39.94331],
  [-105.08755, 39.94276],
  [-105.08733, 39.94054],
  [-105.08725, 39.93923],
  [-105.08624, 39.93846],
  [-105.08711, 39.93793],
  [-105.08639, 39.93712],
  [-105.08665, 39.93653],
  [-105.08895, 39.93638],
  [-105.08838, 39.93490],
  [-105.08987, 39.93446],
  [-105.09557, 39.93504],
  [-105.09786, 39.93448],
  [-105.10057, 39.93600],
  [-105.10847, 39.93623],
  [-105.10924, 39.93638],
  [-105.11107, 39.93748],
  [-105.11366, 39.93595],
  [-105.11543, 39.93591],
  [-105.11824, 39.93515],
  [-105.11890, 39.93297],
  [-105.12032, 39.93279],
  [-105.12145, 39.93374],
  [-105.12293, 39.93324],
  [-105.12313, 39.93317],
  [-105.12374, 39.93272],
  [-105.12393, 39.93264],
  [-105.12593, 39.93357],
  [-105.12717, 39.93301],
  [-105.12904, 39.93372],
  [-105.13677, 39.93871],
  [-105.13680, 39.94004],
  [-105.14747, 39.94638],
  [-105.14744, 39.94904],
  [-105.14963, 39.94899],
  [-105.15227, 39.94982],
  [-105.15409, 39.94993],
  [-105.15935, 39.95411],
  [-105.16096, 39.95508],
  [-105.16015, 39.95566],
  [-105.16121, 39.95618],
  [-105.16376, 39.95811],
  [-105.16539, 39.95798],
  [-105.16678, 39.95895],
  [-105.18424, 39.96537],
  [-105.18435, 39.96779],
  [-105.18279, 39.96799],
  [-105.18249, 39.97184],
  [-105.18276, 39.97316],
  [-105.17607, 39.97967],
  [-105.17533, 39.98081],
  [-105.17553, 39.98289],
  [-105.17643, 39.98479],
  [-105.17712, 39.98563],
  [-105.17932, 39.98630],
  [-105.17561, 39.98676],
  [-105.17492, 40.00002],
  [-105.17803, 40.00025],
  [-105.17819, 40.01166],
  [-105.17848, 40.02578],
  [-105.17851, 40.07261],
  [-105.20336, 40.07289],
  [-105.20575, 40.07143],
  [-105.20663, 40.07134],
  [-105.20689, 40.10149],
  [-105.24911, 40.10178],
  [-105.26351, 40.10535],
  [-105.25946, 40.11258],
  [-105.25885, 40.11609],
  [-105.19777, 40.11616],
  [-105.19747, 40.11289],
  [-105.17422, 40.11248],
  [-105.17374, 40.11280],
  [-105.16990, 40.11612],
  [-105.16092, 40.11565],
  [-105.15962, 40.11627],
  [-105.13447, 40.10169],
  [-105.13162, 40.08919],
  [-105.13080, 40.07277],
  [-105.09805, 40.07280],
  [-105.07457, 40.04495],
  [-105.07471, 40.03676],
  [-105.07451, 40.02932],
  [-105.06148, 40.02941],
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
