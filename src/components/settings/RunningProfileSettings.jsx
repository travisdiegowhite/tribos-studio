/**
 * RunningProfileSettings Component
 * Allows users to configure their running profile: threshold pace, VDOT, race PRs, and pace zones.
 * Settings are stored in localStorage (same pattern as route preferences).
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Stack,
  Group,
  Text,
  Title,
  NumberInput,
  Select,
  Button,
  Badge,
  Box,
  SimpleGrid,
  Paper,
  Divider,
  Alert,
} from '@mantine/core';
import {
  IconRun,
  IconTarget,
  IconTrophy,
  IconInfoCircle,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { tokens } from '../../theme';

const STORAGE_KEY = 'runningProfile';

// Calculate pace zones from threshold pace (seconds per km)
function calculatePaceZones(thresholdPaceSec) {
  if (!thresholdPaceSec || thresholdPaceSec <= 0) return null;
  const tp = thresholdPaceSec;
  return {
    z1: { name: 'Recovery', min: Math.round(tp * 1.35), max: Math.round(tp * 1.50), color: tokens.colors.zone1 },
    z2: { name: 'Easy / Aerobic', min: Math.round(tp * 1.15), max: Math.round(tp * 1.35), color: tokens.colors.zone2 },
    z3: { name: 'Tempo / Marathon', min: Math.round(tp * 1.03), max: Math.round(tp * 1.15), color: tokens.colors.zone3 },
    z4: { name: 'Threshold', min: Math.round(tp * 0.97), max: Math.round(tp * 1.03), color: tokens.colors.zone4 },
    z5: { name: 'VO2max', min: Math.round(tp * 0.86), max: Math.round(tp * 0.97), color: tokens.colors.zone5 },
    z6: { name: 'Anaerobic / Speed', min: Math.round(tp * 0.70), max: Math.round(tp * 0.86), color: tokens.colors.zone6 },
  };
}

// Format seconds-per-km pace to mm:ss/km string
function formatPace(secPerKm) {
  if (!secPerKm) return '-';
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/km`;
}

// Estimate VDOT from a race time (simple approximation using Jack Daniels tables)
function estimateVdot(distanceKey, timeSec) {
  if (!timeSec || timeSec <= 0) return null;
  // Approximate VDOT from common race distances using curve-fit equations
  const distanceMeters = {
    '5k': 5000,
    '10k': 10000,
    'half_marathon': 21097.5,
    'marathon': 42195,
  };
  const d = distanceMeters[distanceKey];
  if (!d) return null;
  // Velocity in m/min
  const v = d / (timeSec / 60);
  // Simplified Daniels VO2 estimation
  const pctVO2 = 0.8 + 0.1894393 * Math.exp(-0.012778 * (timeSec / 60)) + 0.2989558 * Math.exp(-0.1932605 * (timeSec / 60));
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const vdot = vo2 / pctVO2;
  return Math.round(vdot * 10) / 10;
}

// Estimate threshold pace from VDOT
function estimateThresholdPaceFromVdot(vdot) {
  if (!vdot || vdot <= 0) return null;
  // Approximate threshold pace (sec/km) from VDOT using regression
  // Based on Daniels tables: VDOT 30→6:40/km, 40→5:15/km, 50→4:15/km, 60→3:35/km
  const paceMin = 10.77 - 0.119 * vdot;
  return Math.round(paceMin * 60);
}

export default function RunningProfileSettings() {
  const [saving, setSaving] = useState(false);

  // Running profile state
  const [thresholdPaceMin, setThresholdPaceMin] = useState(null);
  const [thresholdPaceSec, setThresholdPaceSec] = useState(null);
  const [vdot, setVdot] = useState(null);
  const [maxHR, setMaxHR] = useState(null);
  const [restingHR, setRestingHR] = useState(null);
  const [lthr, setLthr] = useState(null);

  // Race PR state
  const [raceDistance, setRaceDistance] = useState('5k');
  const [raceTimeMin, setRaceTimeMin] = useState(null);
  const [raceTimeSec, setRaceTimeSec] = useState(null);

  // Computed threshold pace in total seconds per km
  const thresholdPaceTotalSec = useMemo(() => {
    if (thresholdPaceMin == null && thresholdPaceSec == null) return null;
    return ((thresholdPaceMin || 0) * 60) + (thresholdPaceSec || 0);
  }, [thresholdPaceMin, thresholdPaceSec]);

  // Pace zones
  const paceZones = useMemo(
    () => calculatePaceZones(thresholdPaceTotalSec),
    [thresholdPaceTotalSec]
  );

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const profile = JSON.parse(saved);
        if (profile.thresholdPaceSec) {
          setThresholdPaceMin(Math.floor(profile.thresholdPaceSec / 60));
          setThresholdPaceSec(profile.thresholdPaceSec % 60);
        }
        setVdot(profile.vdot || null);
        setMaxHR(profile.maxHR || null);
        setRestingHR(profile.restingHR || null);
        setLthr(profile.lthr || null);
      }
    } catch (err) {
      console.error('Error loading running profile:', err);
    }
  }, []);

  const handleEstimateFromRace = () => {
    if (!raceTimeMin && !raceTimeSec) return;
    const totalSec = ((raceTimeMin || 0) * 60) + (raceTimeSec || 0);
    const estimatedVdot = estimateVdot(raceDistance, totalSec);
    if (estimatedVdot) {
      setVdot(estimatedVdot);
      const estThreshold = estimateThresholdPaceFromVdot(estimatedVdot);
      if (estThreshold) {
        setThresholdPaceMin(Math.floor(estThreshold / 60));
        setThresholdPaceSec(estThreshold % 60);
      }
      notifications.show({
        title: 'VDOT Estimated',
        message: `Estimated VDOT: ${estimatedVdot}. Threshold pace set automatically.`,
        color: 'teal',
      });
    }
  };

  const handleSave = () => {
    setSaving(true);
    try {
      const profile = {
        thresholdPaceSec: thresholdPaceTotalSec,
        vdot: vdot || null,
        maxHR: maxHR || null,
        restingHR: restingHR || null,
        lthr: lthr || null,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      notifications.show({
        title: 'Running Profile Saved',
        message: 'Your running settings and pace zones have been saved',
        color: 'teal',
      });
    } catch (err) {
      console.error('Error saving running profile:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to save running profile',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Stack gap="md">
        <Group gap="sm">
          <IconRun size={24} style={{ color: 'var(--tribos-terracotta-500)' }} />
          <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
            Running Profile
          </Title>
        </Group>
        <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
          Set your threshold pace to calculate personalized running pace zones
        </Text>

        {/* Threshold Pace */}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <NumberInput
            label="Threshold Pace (minutes)"
            description="Minutes portion of your lactate threshold pace per km"
            placeholder="e.g., 4"
            value={thresholdPaceMin ?? ''}
            onChange={(val) => setThresholdPaceMin(val || null)}
            min={2}
            max={10}
            suffix=" min"
          />
          <NumberInput
            label="Threshold Pace (seconds)"
            description="Seconds portion"
            placeholder="e.g., 30"
            value={thresholdPaceSec ?? ''}
            onChange={(val) => setThresholdPaceSec(val || null)}
            min={0}
            max={59}
            suffix=" sec"
          />
        </SimpleGrid>

        {thresholdPaceTotalSec && (
          <Box
            style={{
              padding: tokens.spacing.sm,
              backgroundColor: 'var(--tribos-bg-tertiary)',
              borderRadius: tokens.radius.sm,
            }}
          >
            <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
              Threshold Pace: <Text component="span" fw={700} style={{ color: 'var(--tribos-terracotta-500)' }}>
                {formatPace(thresholdPaceTotalSec)}
              </Text>
            </Text>
          </Box>
        )}

        <Divider label="Estimate from Race Result" labelPosition="center" />

        {/* Race PR estimation */}
        <Alert icon={<IconInfoCircle size={16} />} color="teal" variant="light">
          <Text size="sm">
            Enter a recent race result to estimate your VDOT and threshold pace automatically.
          </Text>
        </Alert>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <Select
            label="Race Distance"
            value={raceDistance}
            onChange={setRaceDistance}
            data={[
              { value: '5k', label: '5K' },
              { value: '10k', label: '10K' },
              { value: 'half_marathon', label: 'Half Marathon' },
              { value: 'marathon', label: 'Marathon' },
            ]}
          />
          <NumberInput
            label="Finish Time (minutes)"
            placeholder="e.g., 25"
            value={raceTimeMin ?? ''}
            onChange={(val) => setRaceTimeMin(val || null)}
            min={0}
            max={600}
          />
          <NumberInput
            label="Finish Time (seconds)"
            placeholder="e.g., 30"
            value={raceTimeSec ?? ''}
            onChange={(val) => setRaceTimeSec(val || null)}
            min={0}
            max={59}
          />
        </SimpleGrid>

        <Button
          variant="light"
          color="teal"
          size="sm"
          leftSection={<IconTrophy size={16} />}
          onClick={handleEstimateFromRace}
          disabled={!raceTimeMin && !raceTimeSec}
        >
          Estimate from Race
        </Button>

        {vdot && (
          <Box
            style={{
              padding: tokens.spacing.sm,
              backgroundColor: 'var(--tribos-bg-tertiary)',
              borderRadius: tokens.radius.sm,
            }}
          >
            <Group gap="sm">
              <IconTarget size={16} style={{ color: 'var(--tribos-terracotta-500)' }} />
              <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                Estimated VDOT: <Text component="span" fw={700} style={{ color: 'var(--tribos-terracotta-500)' }}>
                  {vdot}
                </Text>
              </Text>
            </Group>
          </Box>
        )}

        <Divider label="Heart Rate (Optional)" labelPosition="center" />

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <NumberInput
            label="Max Heart Rate"
            placeholder="e.g., 190"
            value={maxHR ?? ''}
            onChange={(val) => setMaxHR(val || null)}
            min={100}
            max={230}
            suffix=" bpm"
          />
          <NumberInput
            label="Resting Heart Rate"
            placeholder="e.g., 55"
            value={restingHR ?? ''}
            onChange={(val) => setRestingHR(val || null)}
            min={30}
            max={100}
            suffix=" bpm"
          />
          <NumberInput
            label="Lactate Threshold HR"
            placeholder="e.g., 170"
            value={lthr ?? ''}
            onChange={(val) => setLthr(val || null)}
            min={80}
            max={220}
            suffix=" bpm"
          />
        </SimpleGrid>

        {/* Pace Zones Display */}
        {paceZones && (
          <>
            <Divider />
            <Box>
              <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }} mb="xs">
                Your Pace Zones
              </Text>
              <Stack gap="xs">
                {Object.entries(paceZones).map(([key, zone], index) => (
                  <Group key={key} gap="sm" wrap="nowrap">
                    <Badge
                      size="sm"
                      style={{ backgroundColor: zone.color, minWidth: 35 }}
                    >
                      Z{index + 1}
                    </Badge>
                    <Text size="sm" style={{ color: 'var(--tribos-text-primary)', minWidth: 130 }}>
                      {zone.name}
                    </Text>
                    <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                      {formatPace(zone.min)} - {formatPace(zone.max)}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Box>
          </>
        )}

        {!thresholdPaceTotalSec && (
          <Box
            style={{
              padding: tokens.spacing.md,
              backgroundColor: 'var(--tribos-bg-tertiary)',
              borderRadius: tokens.radius.md,
              textAlign: 'center',
            }}
          >
            <Text size="sm" style={{ color: 'var(--tribos-text-muted)' }}>
              Enter your threshold pace above to see personalized pace zones, or use the race estimator.
              Your threshold pace is roughly the pace you can sustain for 60 minutes at maximum effort.
            </Text>
          </Box>
        )}

        <Button color="terracotta" onClick={handleSave} loading={saving}>
          Save Running Profile
        </Button>
      </Stack>
    </Card>
  );
}
