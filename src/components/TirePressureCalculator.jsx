import { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Text,
  Group,
  Box,
  Stack,
  NumberInput,
  SegmentedControl,
  Switch,
  Button,
  Skeleton,
  Tooltip,
  RingProgress,
} from '@mantine/core';
import { IconWheel, IconRefresh, IconSettings } from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { supabase } from '../lib/supabase';
import { tokens } from '../theme';

// Tire Pressure Calculator for Tribos
// Based on Frank Berto's research and SRAM/Silca recommendations

// Weight distribution: typically 40% front, 60% rear for road cycling
const WEIGHT_DISTRIBUTION = { front: 0.40, rear: 0.60 };

// Surface adjustments (multiplier)
const SURFACE_MODIFIERS = {
  smooth: 1.0,      // Fresh tarmac
  mixed: 0.95,      // Typical roads with some rough patches
  rough: 0.90,      // Chip seal, older pavement
  gravel: 0.82,     // Gravel/dirt roads
};

// Tubeless typically runs 5-10% lower
const TUBELESS_MODIFIER = 0.92;

// Get coefficient based on tire width (calibrated for common widths)
const getCoefficient = (width) => {
  if (width <= 23) return 0.92;
  if (width <= 25) return 0.88;
  if (width <= 28) return 0.82;
  if (width <= 32) return 0.75;
  if (width <= 35) return 0.68;
  if (width <= 40) return 0.60;
  if (width <= 45) return 0.52;
  return 0.45; // 50mm+
};

// Calculate optimal tire pressure
const calculatePressure = (riderWeight, bikeWeight, tireWidth, ridingStyle, tubeless, unit) => {
  const totalWeight = riderWeight + bikeWeight;
  const frontLoad = totalWeight * WEIGHT_DISTRIBUTION.front;
  const rearLoad = totalWeight * WEIGHT_DISTRIBUTION.rear;

  const k = getCoefficient(tireWidth);

  let frontPressure = (frontLoad / tireWidth) * k * 10;
  let rearPressure = (rearLoad / tireWidth) * k * 10;

  // Apply surface modifier
  const surfaceMod = SURFACE_MODIFIERS[ridingStyle];
  frontPressure *= surfaceMod;
  rearPressure *= surfaceMod;

  // Apply tubeless modifier
  if (tubeless) {
    frontPressure *= TUBELESS_MODIFIER;
    rearPressure *= TUBELESS_MODIFIER;
  }

  // Clamp to reasonable ranges based on tire width
  const minPressure = tireWidth >= 40 ? 25 : tireWidth >= 32 ? 35 : 50;
  const maxPressure = tireWidth >= 40 ? 55 : tireWidth >= 32 ? 75 : 120;

  frontPressure = Math.max(minPressure, Math.min(maxPressure, frontPressure));
  rearPressure = Math.max(minPressure, Math.min(maxPressure, rearPressure));

  // Convert to bar if needed
  if (unit === 'bar') {
    return {
      front: (frontPressure * 0.0689476).toFixed(1),
      rear: (rearPressure * 0.0689476).toFixed(1),
    };
  }

  return {
    front: Math.round(frontPressure),
    rear: Math.round(rearPressure),
  };
};

// Tire width presets
const TIRE_PRESETS = [
  { label: '23c', value: '23' },
  { label: '25c', value: '25' },
  { label: '28c', value: '28' },
  { label: '32c', value: '32' },
  { label: '38c', value: '38' },
  { label: '45c', value: '45' },
];

// Surface options
const SURFACE_OPTIONS = [
  { value: 'smooth', label: 'Smooth' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'rough', label: 'Rough' },
  { value: 'gravel', label: 'Gravel' },
];

/**
 * TirePressureCalculator Component
 * Dashboard widget that calculates optimal tire pressure
 */
const TirePressureCalculator = ({ loading: parentLoading = false }) => {
  const { user } = useAuth();
  const { unitsPreference } = useUserPreferences();

  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // User inputs - stored in user_profiles.tire_pressure_prefs
  const [riderWeightLbs, setRiderWeightLbs] = useState(165);
  const [bikeWeight, setBikeWeight] = useState(20); // lbs
  const [tireWidth, setTireWidth] = useState('28');
  const [ridingStyle, setRidingStyle] = useState('mixed');
  const [tubeless, setTubeless] = useState(true);
  const [unit, setUnit] = useState('psi');

  const isImperial = unitsPreference !== 'metric';

  // Load user weight from profile and tire pressure preferences
  useEffect(() => {
    const loadUserData = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('weight_kg, tire_pressure_prefs')
          .eq('id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading profile:', error);
        } else if (data) {
          // Set rider weight from profile (convert kg to lbs for internal use)
          if (data.weight_kg) {
            setRiderWeightLbs(Math.round(data.weight_kg * 2.20462));
          }

          // Load saved tire pressure preferences
          if (data.tire_pressure_prefs) {
            const prefs = data.tire_pressure_prefs;
            if (prefs.bikeWeight) setBikeWeight(prefs.bikeWeight);
            if (prefs.tireWidth) setTireWidth(String(prefs.tireWidth));
            if (prefs.ridingStyle) setRidingStyle(prefs.ridingStyle);
            if (prefs.tubeless !== undefined) setTubeless(prefs.tubeless);
            if (prefs.unit) setUnit(prefs.unit);
          }
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [user?.id]);

  // Save preferences when they change (debounced)
  useEffect(() => {
    if (loading || !user?.id) return;

    const savePrefs = async () => {
      try {
        await supabase
          .from('user_profiles')
          .update({
            tire_pressure_prefs: {
              bikeWeight,
              tireWidth: parseInt(tireWidth),
              ridingStyle,
              tubeless,
              unit,
            },
          })
          .eq('id', user.id);
      } catch (error) {
        console.error('Error saving preferences:', error);
      }
    };

    const timeoutId = setTimeout(savePrefs, 500);
    return () => clearTimeout(timeoutId);
  }, [bikeWeight, tireWidth, ridingStyle, tubeless, unit, user?.id, loading]);

  // Calculate pressure
  const pressure = useMemo(() => {
    return calculatePressure(
      riderWeightLbs,
      bikeWeight,
      parseInt(tireWidth),
      ridingStyle,
      tubeless,
      unit
    );
  }, [riderWeightLbs, bikeWeight, tireWidth, ridingStyle, tubeless, unit]);

  // Loading skeleton
  if (loading || parentLoading) {
    return (
      <Card>
        <Stack gap="md">
          <Skeleton height={24} width={180} />
          <Group>
            <Skeleton height={80} width={80} circle />
            <Skeleton height={80} width={80} circle />
          </Group>
          <Skeleton height={40} />
        </Stack>
      </Card>
    );
  }

  // Normalize pressure for ring visualization (50-120 PSI range -> 0-100%)
  const maxPsi = 120;
  const frontNormalized = Math.min(100, (parseFloat(pressure.front) / (unit === 'bar' ? maxPsi * 0.0689476 : maxPsi)) * 100);
  const rearNormalized = Math.min(100, (parseFloat(pressure.rear) / (unit === 'bar' ? maxPsi * 0.0689476 : maxPsi)) * 100);

  return (
    <Card>
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="xs">
            <IconWheel size={18} style={{ color: 'var(--tribos-lime)' }} />
            <Text fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
              Tire Pressure
            </Text>
          </Group>
          <Group gap="xs">
            <SegmentedControl
              size="xs"
              value={unit}
              onChange={setUnit}
              data={[
                { label: 'PSI', value: 'psi' },
                { label: 'BAR', value: 'bar' },
              ]}
              styles={{
                root: { backgroundColor: 'var(--tribos-bg-tertiary)' },
              }}
            />
            <Tooltip label="Settings">
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                px={6}
                onClick={() => setShowSettings(!showSettings)}
              >
                <IconSettings size={16} />
              </Button>
            </Tooltip>
          </Group>
        </Group>

        {/* Pressure Display */}
        <Group justify="center" gap="xl">
          {/* Front Wheel */}
          <Box ta="center">
            <RingProgress
              size={90}
              thickness={6}
              roundCaps
              sections={[
                { value: frontNormalized, color: 'var(--tribos-text-secondary)' },
              ]}
              label={
                <Box ta="center">
                  <Text size="lg" fw={700} style={{ color: 'var(--tribos-text-primary)' }}>
                    {pressure.front}
                  </Text>
                </Box>
              }
            />
            <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mt={4}>
              Front
            </Text>
          </Box>

          {/* Rear Wheel */}
          <Box ta="center">
            <RingProgress
              size={90}
              thickness={6}
              roundCaps
              sections={[
                { value: rearNormalized, color: 'var(--tribos-lime)' },
              ]}
              label={
                <Box ta="center">
                  <Text size="lg" fw={700} style={{ color: 'var(--tribos-lime)' }}>
                    {pressure.rear}
                  </Text>
                </Box>
              }
            />
            <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mt={4}>
              Rear
            </Text>
          </Box>
        </Group>

        {/* Quick Settings Row */}
        <Group gap="xs" justify="center">
          <SegmentedControl
            size="xs"
            value={tireWidth}
            onChange={setTireWidth}
            data={TIRE_PRESETS}
            styles={{
              root: { backgroundColor: 'var(--tribos-bg-tertiary)' },
            }}
          />
        </Group>

        {/* Expandable Settings */}
        {showSettings && (
          <Box
            style={{
              padding: tokens.spacing.md,
              backgroundColor: 'var(--tribos-bg-tertiary)',
              borderRadius: tokens.radius.md,
            }}
          >
            <Stack gap="sm">
              {/* Weight Inputs */}
              <Group grow>
                <NumberInput
                  label="Rider weight"
                  size="xs"
                  value={isImperial ? riderWeightLbs : Math.round(riderWeightLbs / 2.20462)}
                  onChange={(val) => {
                    if (val) {
                      setRiderWeightLbs(isImperial ? val : Math.round(val * 2.20462));
                    }
                  }}
                  suffix={isImperial ? ' lbs' : ' kg'}
                  min={80}
                  max={400}
                  styles={{
                    input: { backgroundColor: 'var(--tribos-bg-secondary)' },
                  }}
                />
                <NumberInput
                  label="Bike + gear"
                  size="xs"
                  value={isImperial ? bikeWeight : Math.round(bikeWeight / 2.20462)}
                  onChange={(val) => {
                    if (val) {
                      setBikeWeight(isImperial ? val : Math.round(val * 2.20462));
                    }
                  }}
                  suffix={isImperial ? ' lbs' : ' kg'}
                  min={10}
                  max={100}
                  styles={{
                    input: { backgroundColor: 'var(--tribos-bg-secondary)' },
                  }}
                />
              </Group>

              {/* Surface Type */}
              <Box>
                <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mb={4}>
                  Surface
                </Text>
                <SegmentedControl
                  size="xs"
                  fullWidth
                  value={ridingStyle}
                  onChange={setRidingStyle}
                  data={SURFACE_OPTIONS}
                  styles={{
                    root: { backgroundColor: 'var(--tribos-bg-secondary)' },
                  }}
                />
              </Box>

              {/* Tubeless Toggle */}
              <Group justify="space-between">
                <Box>
                  <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                    Tubeless
                  </Text>
                  <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                    Allows ~8% lower pressure
                  </Text>
                </Box>
                <Switch
                  checked={tubeless}
                  onChange={(e) => setTubeless(e.currentTarget.checked)}
                  color="lime"
                />
              </Group>

              {/* Total Weight Display */}
              <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} ta="center">
                Total: {isImperial
                  ? `${riderWeightLbs + bikeWeight} lbs`
                  : `${Math.round((riderWeightLbs + bikeWeight) / 2.20462)} kg`
                }
              </Text>
            </Stack>
          </Box>
        )}

        {/* Tips */}
        <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} ta="center">
          Based on {parseInt(tireWidth)}c {tubeless ? 'tubeless' : 'clincher'} on {ridingStyle} roads
        </Text>
      </Stack>
    </Card>
  );
};

export default TirePressureCalculator;
