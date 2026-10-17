/**
 * RunningProfileSettings Component
 * Threshold pace, VDOT, heart-rate anchors and pace zones for runners.
 *
 * Stored on user_profiles (threshold_pace_sec, vdot, max_hr, resting_hr, lthr —
 * migration 042), where the coach and the run-load code can read them. Until
 * multisport phase 0B this card saved to localStorage only, so nothing on the
 * server ever saw a runner's thresholds; a value still sitting there is copied
 * to the database once, and the key is removed only after that save succeeds.
 *
 * Phase 5: the threshold pace and LTHR estimated from the athlete's runs
 * (stored nightly, migration 136) are OFFERED here — "Use this" fills the
 * inputs and saving stays explicit. The card also lists race PRs (found in
 * races by the server, or saved from the race estimator).
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
  Divider,
  Alert,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { tokens } from '../../theme';
import { Info, PersonSimpleRun, Target, Trophy } from '@phosphor-icons/react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  calculatePaceZones,
  estimateThresholdPaceFromVdot,
  estimateVdot,
  formatPacePerKm as formatPace,
} from '../../utils/paceZones';
import { loadRacePrs, saveManualPr, RACE_PR_LABELS } from '../../lib/running/racePrs';
import { formatRaceTime } from '../../../api/utils/runRacePrs.js';

export const LEGACY_STORAGE_KEY = 'runningProfile';

const ZONE_COLORS = {
  z1: tokens.colors.zone1,
  z2: tokens.colors.zone2,
  z3: tokens.colors.zone3,
  z4: tokens.colors.zone4,
  z5: tokens.colors.zone5,
  z6: tokens.colors.zone6,
};

const PROFILE_COLUMNS = 'threshold_pace_sec, vdot, max_hr, resting_hr, lthr';
const ESTIMATE_COLUMNS = 'estimated_threshold_pace_sec, estimated_lthr';

/** Offer an estimate when there is no pace, or it differs by more than this. */
export const ESTIMATE_OFFER_THRESHOLD = 0.03;

/** True when the estimated pace is worth offering against the entered one. */
export function shouldOfferEstimate(enteredSec, estimatedSec) {
  if (!(estimatedSec > 0)) return false;
  if (!(enteredSec > 0)) return true;
  return Math.abs(enteredSec - estimatedSec) / estimatedSec > ESTIMATE_OFFER_THRESHOLD;
}

/** The localStorage profile the old card wrote, or null if absent/empty. */
export function readLegacyRunningProfile() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    const row = {
      threshold_pace_sec: p.thresholdPaceSec || null,
      vdot: p.vdot || null,
      max_hr: p.maxHR || null,
      resting_hr: p.restingHR || null,
      lthr: p.lthr || null,
    };
    return Object.values(row).some((v) => v != null) ? row : null;
  } catch {
    return null;
  }
}

export default function RunningProfileSettings() {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  // Running profile state
  const [thresholdPaceMin, setThresholdPaceMin] = useState(null);
  const [thresholdPaceSec, setThresholdPaceSec] = useState(null);
  const [vdot, setVdot] = useState(null);
  const [maxHR, setMaxHR] = useState(null);
  const [restingHR, setRestingHR] = useState(null);
  const [lthr, setLthr] = useState(null);

  // History estimates (migration 136) and race PRs
  const [estimate, setEstimate] = useState({ paceSec: null, lthr: null });
  const [racePrs, setRacePrs] = useState([]);

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
  const paceZones = useMemo(() => {
    const zones = calculatePaceZones(thresholdPaceTotalSec);
    if (!zones) return null;
    return Object.fromEntries(
      Object.entries(zones).map(([key, zone]) => [key, { ...zone, color: ZONE_COLORS[key] }]),
    );
  }, [thresholdPaceTotalSec]);

  const applyRow = (row) => {
    if (row.threshold_pace_sec) {
      setThresholdPaceMin(Math.floor(row.threshold_pace_sec / 60));
      setThresholdPaceSec(row.threshold_pace_sec % 60);
    }
    setVdot(row.vdot != null ? Number(row.vdot) : null);
    setMaxHR(row.max_hr || null);
    setRestingHR(row.resting_hr || null);
    setLthr(row.lthr || null);
  };

  // Load from the profile row, migrating a leftover localStorage profile once.
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', user.id)
        .maybeSingle();
      if (!active) return;
      if (error) {
        console.error('Error loading running profile:', error);
        return;
      }
      const dbEmpty = !data || Object.values(data).every((v) => v == null);
      const legacy = dbEmpty ? readLegacyRunningProfile() : null;
      if (legacy) {
        applyRow(legacy);
        const { error: migrateError } = await supabase
          .from('user_profiles')
          .update(legacy)
          .eq('id', user.id);
        if (!migrateError) {
          try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* storage unavailable */ }
        } else {
          console.error('Error migrating running profile from localStorage:', migrateError);
        }
        return;
      }
      if (data) applyRow(data);
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  // Estimates and PRs: their own fail-soft reads, so an unapplied 136 changes
  // nothing above.
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select(ESTIMATE_COLUMNS)
          .eq('id', user.id)
          .maybeSingle();
        if (active && !error && data) {
          setEstimate({
            paceSec: Number(data.estimated_threshold_pace_sec) > 0 ? Number(data.estimated_threshold_pace_sec) : null,
            lthr: Number(data.estimated_lthr) > 0 ? Number(data.estimated_lthr) : null,
          });
        }
      } catch { /* estimate columns not there yet */ }
      const prs = await loadRacePrs(user.id);
      if (active) setRacePrs(prs);
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const offerEstimate = shouldOfferEstimate(thresholdPaceTotalSec, estimate.paceSec);

  const handleUseEstimate = () => {
    if (!estimate.paceSec) return;
    setThresholdPaceMin(Math.floor(estimate.paceSec / 60));
    setThresholdPaceSec(estimate.paceSec % 60);
    if (!lthr && estimate.lthr) setLthr(estimate.lthr);
  };

  const raceTotalSec = ((raceTimeMin || 0) * 60) + (raceTimeSec || 0);

  const handleSavePr = async () => {
    if (!user?.id || !(raceTotalSec > 0)) return;
    const result = await saveManualPr(
      user.id,
      { distance: raceDistance, time_seconds: raceTotalSec },
      racePrs,
    );
    if (!result.ok) {
      notifications.show({ title: 'PR not saved', message: result.error || 'Could not save the race PR', color: 'red' });
      return;
    }
    if (!result.saved) {
      notifications.show({
        title: 'Not a PR',
        message: `Your ${RACE_PR_LABELS[raceDistance]} PR is already faster.`,
        color: 'gray',
      });
      return;
    }
    setRacePrs(await loadRacePrs(user.id));
    notifications.show({
      title: 'PR saved',
      message: `${RACE_PR_LABELS[raceDistance]} ${formatRaceTime(raceTotalSec)}`,
      color: 'teal',
    });
  };

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

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          threshold_pace_sec: thresholdPaceTotalSec || null,
          vdot: vdot || null,
          max_hr: maxHR || null,
          resting_hr: restingHR || null,
          lthr: lthr || null,
        })
        .eq('id', user.id);
      if (error) throw error;
      try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* storage unavailable */ }
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
          <PersonSimpleRun size={24} style={{ color: 'var(--color-teal)' }} />
          <Title order={3} style={{ color: 'var(--color-text-primary)' }}>
            Running Profile
          </Title>
        </Group>
        <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
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
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: tokens.radius.sm,
            }}
          >
            <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
              Threshold Pace: <Text component="span" fw={700} style={{ color: 'var(--color-teal)' }}>
                {formatPace(thresholdPaceTotalSec)}
              </Text>
            </Text>
          </Box>
        )}

        {offerEstimate && (
          <Group
            data-testid="run-estimate-offer"
            justify="space-between"
            wrap="nowrap"
            style={{ padding: tokens.spacing.sm, border: '1px solid var(--color-border)' }}
          >
            <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
              Estimated from your runs:{' '}
              <Text component="span" fw={700} ff="monospace">
                {formatPace(estimate.paceSec)}
              </Text>
              {!lthr && estimate.lthr ? ` · LTHR ${estimate.lthr} bpm` : ''}
            </Text>
            <Button size="xs" variant="light" onClick={handleUseEstimate}>
              Use this
            </Button>
          </Group>
        )}

        <Divider label="Estimate from Race Result" labelPosition="center" />

        {/* Race PR estimation */}
        <Alert icon={<Info size={16} />} color="teal" variant="light">
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
          leftSection={<Trophy size={16} />}
          onClick={handleEstimateFromRace}
          disabled={!raceTimeMin && !raceTimeSec}
        >
          Estimate from Race
        </Button>
        <Button
          variant="subtle"
          size="sm"
          onClick={handleSavePr}
          disabled={!(raceTotalSec > 0)}
        >
          Save as PR
        </Button>

        {racePrs.length > 0 && (
          <Box data-testid="race-prs">
            <Text size="sm" fw={600} style={{ color: 'var(--color-text-primary)' }} mb="xs">
              Race PRs
            </Text>
            <Stack gap={4}>
              {racePrs.map((pr) => (
                <Group key={pr.distance} gap="sm" wrap="nowrap">
                  <Text size="sm" style={{ minWidth: 110 }}>{RACE_PR_LABELS[pr.distance]}</Text>
                  <Text size="sm" fw={700} ff="monospace">{formatRaceTime(pr.time_seconds)}</Text>
                  <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
                    {[pr.race_date, pr.race_name].filter(Boolean).join(' · ')}
                    {pr.source === 'auto' ? ' · auto' : ''}
                  </Text>
                </Group>
              ))}
            </Stack>
          </Box>
        )}

        {vdot && (
          <Box
            style={{
              padding: tokens.spacing.sm,
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: tokens.radius.sm,
            }}
          >
            <Group gap="sm">
              <Target size={16} style={{ color: 'var(--color-teal)' }} />
              <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
                Estimated VDOT: <Text component="span" fw={700} style={{ color: 'var(--color-teal)' }}>
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
              <Text size="sm" fw={600} style={{ color: 'var(--color-text-primary)' }} mb="xs">
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
                    <Text size="sm" style={{ color: 'var(--color-text-primary)', minWidth: 130 }}>
                      {zone.name}
                    </Text>
                    <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
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
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: tokens.radius.md,
              textAlign: 'center',
            }}
          >
            <Text size="sm" style={{ color: 'var(--color-text-muted)' }}>
              Enter your threshold pace above to see personalized pace zones, or use the race estimator.
              Your threshold pace is roughly the pace you can sustain for 60 minutes at maximum effort.
            </Text>
          </Box>
        )}

        <Button color="teal" onClick={handleSave} loading={saving}>
          Save Running Profile
        </Button>
      </Stack>
    </Card>
  );
}
