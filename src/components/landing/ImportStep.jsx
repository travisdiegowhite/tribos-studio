import { useState, useEffect, useRef } from 'react';
import { Container, Text, Paper, Group, Box, Stack } from '@mantine/core';
import { useScrollReveal, usePrefersReducedMotion } from './useScrollReveal';

// Realistic rides from the Boulder/Longmont/Hygiene CO area
// Power numbers calibrated to FTP ~245W
const rides = [
  { date: 'Feb 16', name: 'Hygiene Loop', distance: '42.1 mi', power: '198w' },
  { date: 'Feb 14', name: 'Erie Gravel/Unpaved', distance: '50.6 mi', power: '196w' },
  { date: 'Feb 12', name: 'Lyons Loop', distance: '52.3 mi', power: '188w' },
  { date: 'Feb 10', name: 'Diagonal Highway Tempo', distance: '31.7 mi', power: '215w' },
  { date: 'Feb 8', name: 'Boulder Creek Path', distance: '22.3 mi', power: '162w' },
  { date: 'Feb 5', name: 'Niwot Back Roads', distance: '44.8 mi', power: '196w' },
  { date: 'Feb 3', name: 'Left Hand Canyon Climb', distance: '35.6 mi', power: '224w' },
  { date: 'Feb 1', name: 'St Vrain Greenway', distance: '18.9 mi', power: '148w' },
  { date: 'Jan 30', name: 'US-36 Tempo', distance: '46.2 mi', power: '208w' },
  { date: 'Jan 28', name: 'Heil Valley Ranch', distance: '26.5 mi', power: '178w' },
];

const TOTAL_RIDES = 347;
const ROW_DELAY = 280;

export default function ImportStep() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.2 });
  const reducedMotion = usePrefersReducedMotion();
  const [visibleRows, setVisibleRows] = useState(0);
  const [rideCount, setRideCount] = useState(0);
  const [progressWidth, setProgressWidth] = useState(0);
  const countAnimRef = useRef(null);

  useEffect(() => {
    if (!isVisible) return;

    if (reducedMotion) {
      setVisibleRows(rides.length);
      setRideCount(TOTAL_RIDES);
      setProgressWidth(100);
      return;
    }

    // Animate rows appearing
    const timers = rides.map((_, i) =>
      setTimeout(() => setVisibleRows(i + 1), ROW_DELAY * i)
    );

    // Animate progress bar
    requestAnimationFrame(() => setProgressWidth(100));

    // Animate counter
    const duration = ROW_DELAY * rides.length;
    const startTime = performance.now();
    const animateCount = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out curve
      const eased = 1 - Math.pow(1 - progress, 3);
      setRideCount(Math.round(eased * TOTAL_RIDES));
      if (progress < 1) {
        countAnimRef.current = requestAnimationFrame(animateCount);
      }
    };
    countAnimRef.current = requestAnimationFrame(animateCount);

    return () => {
      timers.forEach(clearTimeout);
      if (countAnimRef.current) cancelAnimationFrame(countAnimRef.current);
    };
  }, [isVisible, reducedMotion]);

  return (
    <Box
      py={{ base: 60, md: 100 }}
      px={{ base: 'md', md: 'xl' }}
      style={{ backgroundColor: 'var(--tribos-bg-secondary)', borderTop: '1px solid var(--tribos-border-default)', borderBottom: '1px solid var(--tribos-border-default)' }}
    >
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
                Step 02 — Import
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
                Your ride history flows in.
              </Text>
            </div>

            <Paper className="step-content" p="md" style={{ width: '100%', maxWidth: 600, overflow: 'hidden' }}>
              {/* Progress bar */}
              <Box mb="md">
                <Group justify="space-between" mb={6}>
                  <Text
                    size="xs"
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      color: 'var(--tribos-text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                    }}
                  >
                    Importing rides
                  </Text>
                  <Text
                    size="xs"
                    fw={600}
                    className="import-counter"
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      color: 'var(--tribos-terracotta-500)',
                    }}
                  >
                    {rideCount} rides
                  </Text>
                </Group>
                <Box
                  style={{
                    height: 4,
                    backgroundColor: 'var(--tribos-border-default)',
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    className="import-progress-bar"
                    style={{
                      height: '100%',
                      width: `${progressWidth}%`,
                      background: `linear-gradient(90deg, var(--tribos-terracotta-500), var(--tribos-teal-500))`,
                    }}
                  />
                </Box>
              </Box>

              {/* Ride list header */}
              <Group
                justify="space-between"
                mb="xs"
                pb="xs"
                style={{ borderBottom: '1px solid var(--tribos-border-default)' }}
              >
                <Text size="xs" fw={600} style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-muted)', textTransform: 'uppercase', letterSpacing: '1px', width: 54 }}>
                  Date
                </Text>
                <Text size="xs" fw={600} style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-muted)', textTransform: 'uppercase', letterSpacing: '1px', flex: 1, paddingLeft: 12 }}>
                  Ride
                </Text>
                <Text size="xs" fw={600} style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-muted)', textTransform: 'uppercase', letterSpacing: '1px', width: 64, textAlign: 'right' }}>
                  Dist
                </Text>
                <Text size="xs" fw={600} style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-muted)', textTransform: 'uppercase', letterSpacing: '1px', width: 50, textAlign: 'right' }}>
                  Pwr
                </Text>
              </Group>

              {/* Ride rows */}
              <Stack gap={0}>
                {rides.map((ride, index) => (
                  <Group
                    key={ride.name}
                    className={`ride-row ${index < visibleRows ? 'visible' : ''}`}
                    justify="space-between"
                    py={6}
                    style={{
                      borderBottom: index < rides.length - 1 ? '1px solid var(--tribos-border-subtle, var(--tribos-border-default))' : undefined,
                    }}
                  >
                    <Text size="xs" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-muted)', width: 54 }}>
                      {ride.date}
                    </Text>
                    <Text size="sm" fw={500} style={{ color: 'var(--tribos-text-primary)', flex: 1, paddingLeft: 12 }}>
                      {ride.name}
                    </Text>
                    <Text size="xs" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-text-secondary)', width: 64, textAlign: 'right' }}>
                      {ride.distance}
                    </Text>
                    <Text size="xs" style={{ fontFamily: "'DM Mono', monospace", color: 'var(--tribos-terracotta-500)', width: 50, textAlign: 'right' }}>
                      {ride.power}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Paper>
          </Stack>
        </div>
      </Container>
    </Box>
  );
}
