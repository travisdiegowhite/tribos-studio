/**
 * TirePressureCard Component
 * Context-aware tire pressure calculator that auto-populates from route,
 * weather, and gear data. Falls back to manual inputs when context is missing.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Text,
  Group,
  Box,
  Stack,
  NumberInput,
  SegmentedControl,
  Select,
  Switch,
  Button,
  Skeleton,
  Tooltip,
  RingProgress,
  Alert,
  Badge,
} from '@mantine/core';
import {
  IconWheel,
  IconSettings,
  IconThermometer,
  IconAlertTriangle,
  IconBike,
} from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthContext';
import { useUserPreferences } from '../../contexts/UserPreferencesContext';
import { useGear } from '../../hooks/useGear';
import { supabase } from '../../lib/supabase';
import { tokens } from '../../theme';
import {
  calculateTirePressure,
  mapRouteSurfaceToPressSurface,
  formatPressure,
  formatPressureSummary,
} from '../../utils/tirePressure';

const TIRE_PRESETS = [
  { label: '23c', value: '23' },
  { label: '25c', value: '25' },
  { label: '28c', value: '28' },
  { label: '32c', value: '32' },
  { label: '38c', value: '38' },
  { label: '40c', value: '40' },
  { label: '45c', value: '45' },
];

const SURFACE_OPTIONS = [
  { value: 'paved', label: 'Paved' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'gravel', label: 'Gravel' },
  { value: 'unpaved', label: 'Unpaved' },
];

const KG_TO_LBS = 2.20462;

/**
 * TirePressureCard - Enhanced tire pressure calculator
 *
 * @param {object} props
 * @param {object} [props.route] - Route context { surfaceType }
 * @param {object} [props.weather] - Weather context { temperatureCelsius }
 * @param {boolean} [props.compact] - Compact display mode
 * @param {boolean} [props.useImperial] - Use imperial units for weight
 */
export default function TirePressureCard({
  route,
  weather,
  compact = false,
  useImperial = true,
}) {
  const { user } = useAuth();
  const { unitsPreference } = useUserPreferences();
  const { gearItems, loading: gearLoading, getDefaultBikeSetup } = useGear({
    userId: user?.id,
  });

  const isImperial = useImperial || unitsPreference !== 'metric';

  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Core inputs
  const [riderWeightKg, setRiderWeightKg] = useState(75);
  const [bikeWeightKg, setBikeWeightKg] = useState(9);
  const [tireWidthMm, setTireWidthMm] = useState('28');
  const [surface, setSurface] = useState('mixed');
  const [tubeless, setTubeless] = useState(false);
  const [unit, setUnit] = useState('psi');

  // Gear-derived values
  const [maxPressurePsi, setMaxPressurePsi] = useState(null);
  const [rimWidthMm, setRimWidthMm] = useState(null);

  // Bike selection
  const [selectedBikeId, setSelectedBikeId] = useState(null);
  const [gearSetupLoaded, setGearSetupLoaded] = useState(false);

  // Track which values came from context vs manual
  const [autoSources, setAutoSources] = useState({});

  // Available bikes for selector
  const activeBikes = useMemo(
    () => gearItems.filter((g) => g.sport_type === 'cycling' && g.status === 'active'),
    [gearItems]
  );

  // Load user weight from profile
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

        if (!error && data) {
          if (data.weight_kg) {
            setRiderWeightKg(data.weight_kg);
          }
          // Load saved preferences as fallback
          if (data.tire_pressure_prefs) {
            const prefs = data.tire_pressure_prefs;
            if (prefs.bikeWeight) setBikeWeightKg(prefs.bikeWeight / KG_TO_LBS);
            if (prefs.tireWidth) setTireWidthMm(String(prefs.tireWidth));
            if (prefs.ridingStyle) {
              // Map old riding style to new surface names
              const surfaceMap = { smooth: 'paved', mixed: 'mixed', rough: 'mixed', gravel: 'gravel' };
              setSurface(surfaceMap[prefs.ridingStyle] || 'mixed');
            }
            if (prefs.tubeless !== undefined) setTubeless(prefs.tubeless);
            if (prefs.unit) setUnit(prefs.unit);
          }
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [user?.id]);

  // Auto-populate surface from route
  useEffect(() => {
    if (route?.surfaceType) {
      const mapped = mapRouteSurfaceToPressSurface(route.surfaceType);
      setSurface(mapped);
      setAutoSources((prev) => ({ ...prev, surface: 'route' }));
    }
  }, [route?.surfaceType]);

  // Load gear data once gear items are available
  useEffect(() => {
    if (gearLoading || gearSetupLoaded || activeBikes.length === 0) return;

    const loadGearSetup = async () => {
      try {
        const setup = await getDefaultBikeSetup();
        if (!setup) return;

        setSelectedBikeId(setup.bike.id);
        const sources = {};

        // Populate from tire metadata
        if (setup.tires?.metadata) {
          const meta = setup.tires.metadata;
          if (meta.width_mm) {
            setTireWidthMm(String(meta.width_mm));
            sources.tireWidth = setup.tires.brand
              ? `${setup.tires.brand} ${setup.tires.model || ''}`.trim()
              : 'gear';
          }
          if (meta.tubeless !== undefined) {
            setTubeless(meta.tubeless);
            sources.tubeless = 'gear';
          }
          if (meta.max_pressure_psi) {
            setMaxPressurePsi(meta.max_pressure_psi);
            sources.maxPressure = 'gear';
          }
        }

        // Populate from wheel metadata
        if (setup.wheels?.metadata) {
          const meta = setup.wheels.metadata;
          if (meta.rim_width_mm) {
            setRimWidthMm(meta.rim_width_mm);
            sources.rimWidth = setup.wheels.brand
              ? `${setup.wheels.brand} ${setup.wheels.model || ''}`.trim()
              : 'gear';
          }
        }

        setAutoSources((prev) => ({ ...prev, ...sources }));
      } catch {
        // Non-critical
      } finally {
        setGearSetupLoaded(true);
      }
    };

    loadGearSetup();
  }, [gearLoading, gearSetupLoaded, activeBikes.length, getDefaultBikeSetup]);

  // Handle bike selection change
  const handleBikeChange = useCallback(
    async (bikeId) => {
      if (!bikeId) return;
      setSelectedBikeId(bikeId);
      setGearSetupLoaded(false); // Trigger reload with the new bike

      try {
        const { getGearDetail } = await import('../../hooks/useGear');
        // We can't call getGearDetail directly from import, so use the API
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(
          `${typeof window !== 'undefined' && import.meta.env?.PROD ? '' : 'http://localhost:3000'}/api/gear`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              action: 'get_gear',
              userId: session.user.id,
              gearId: bikeId,
            }),
          }
        );
        const data = await response.json();
        if (!response.ok) return;

        const components = data.components || [];
        const tires = components.find(
          (c) =>
            c.status === 'active' &&
            (c.component_type === 'tires_road' || c.component_type === 'tires_gravel')
        );
        const wheels = components.find(
          (c) =>
            c.status === 'active' &&
            (c.component_type === 'wheels_road' || c.component_type === 'wheels_gravel')
        );

        const sources = {};
        if (tires?.metadata) {
          if (tires.metadata.width_mm) {
            setTireWidthMm(String(tires.metadata.width_mm));
            sources.tireWidth = 'gear';
          }
          if (tires.metadata.tubeless !== undefined) {
            setTubeless(tires.metadata.tubeless);
            sources.tubeless = 'gear';
          }
          if (tires.metadata.max_pressure_psi) {
            setMaxPressurePsi(tires.metadata.max_pressure_psi);
            sources.maxPressure = 'gear';
          }
        }
        if (wheels?.metadata?.rim_width_mm) {
          setRimWidthMm(wheels.metadata.rim_width_mm);
          sources.rimWidth = 'gear';
        }
        setAutoSources((prev) => ({ ...prev, ...sources }));
      } catch {
        // Non-critical
      }
    },
    []
  );

  // Save preferences on change
  useEffect(() => {
    if (loading || !user?.id) return;

    const savePrefs = async () => {
      try {
        await supabase
          .from('user_profiles')
          .update({
            tire_pressure_prefs: {
              bikeWeight: Math.round(bikeWeightKg * KG_TO_LBS),
              tireWidth: parseInt(tireWidthMm),
              ridingStyle: surface === 'paved' ? 'smooth' : surface,
              tubeless,
              unit,
            },
          })
          .eq('id', user.id);
      } catch {
        // Non-critical
      }
    };

    const timeoutId = setTimeout(savePrefs, 500);
    return () => clearTimeout(timeoutId);
  }, [bikeWeightKg, tireWidthMm, surface, tubeless, unit, user?.id, loading]);

  // Calculate pressure
  const result = useMemo(() => {
    return calculateTirePressure({
      riderWeightKg,
      bikeWeightKg,
      tireWidthMm: parseInt(tireWidthMm),
      surface,
      tubeless,
      temperatureCelsius: weather?.temperatureCelsius,
      rimWidthMm: rimWidthMm || undefined,
      maxPressurePsi: maxPressurePsi || undefined,
    });
  }, [riderWeightKg, bikeWeightKg, tireWidthMm, surface, tubeless, weather?.temperatureCelsius, rimWidthMm, maxPressurePsi]);

  // Loading skeleton
  if (loading) {
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

  // Normalize for ring visualization
  const maxPsi = 120;
  const frontValue = unit === 'bar' ? result.frontBar : result.frontPsi;
  const rearValue = unit === 'bar' ? result.rearBar : result.rearPsi;
  const frontNormalized = Math.min(100, (result.frontPsi / maxPsi) * 100);
  const rearNormalized = Math.min(100, (result.rearPsi / maxPsi) * 100);

  return (
    <Card>
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="xs">
            <IconWheel size={18} style={{ color: 'var(--tribos-terracotta-500)' }} />
            <Text fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
              Tire Pressure
            </Text>
            {weather?.temperatureCelsius != null && (
              <Tooltip label={`Adjusted for ${Math.round(weather.temperatureCelsius)}°C`}>
                <Badge
                  size="xs"
                  variant="light"
                  color={weather.temperatureCelsius < 5 ? 'blue' : weather.temperatureCelsius > 35 ? 'red' : 'gray'}
                  leftSection={<IconThermometer size={10} />}
                >
                  {Math.round(weather.temperatureCelsius)}°C
                </Badge>
              </Tooltip>
            )}
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

        {/* Bike selector (when multiple bikes exist) */}
        {activeBikes.length > 1 && (
          <Select
            size="xs"
            placeholder="Select bike"
            data={activeBikes.map((b) => ({ value: b.id, label: b.name }))}
            value={selectedBikeId}
            onChange={handleBikeChange}
            leftSection={<IconBike size={14} />}
            comboboxProps={{ withinPortal: false }}
            styles={{
              input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
            }}
          />
        )}

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
                    {unit === 'bar' ? frontValue : frontValue}
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
                { value: rearNormalized, color: 'var(--tribos-terracotta-500)' },
              ]}
              label={
                <Box ta="center">
                  <Text size="lg" fw={700} style={{ color: 'var(--tribos-terracotta-500)' }}>
                    {unit === 'bar' ? rearValue : rearValue}
                  </Text>
                </Box>
              }
            />
            <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} mt={4}>
              Rear
            </Text>
          </Box>
        </Group>

        {/* Warnings */}
        {result.warnings.length > 0 && (
          <Alert
            icon={<IconAlertTriangle size={16} />}
            color="yellow"
            variant="light"
            p="xs"
          >
            {result.warnings.map((w, i) => (
              <Text key={i} size="xs">{w}</Text>
            ))}
          </Alert>
        )}

        {/* Quick tire width selector */}
        <Group gap="xs" justify="center">
          <SegmentedControl
            size="xs"
            value={tireWidthMm}
            onChange={(v) => {
              setTireWidthMm(v);
              setAutoSources((prev) => {
                const next = { ...prev };
                delete next.tireWidth;
                return next;
              });
            }}
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
                  value={isImperial ? Math.round(riderWeightKg * KG_TO_LBS) : Math.round(riderWeightKg)}
                  onChange={(val) => {
                    if (val) {
                      setRiderWeightKg(isImperial ? val / KG_TO_LBS : val);
                    }
                  }}
                  suffix={isImperial ? ' lbs' : ' kg'}
                  min={isImperial ? 80 : 36}
                  max={isImperial ? 400 : 180}
                  styles={{
                    input: { backgroundColor: 'var(--tribos-bg-secondary)' },
                  }}
                />
                <NumberInput
                  label="Bike + gear"
                  size="xs"
                  value={isImperial ? Math.round(bikeWeightKg * KG_TO_LBS) : Math.round(bikeWeightKg)}
                  onChange={(val) => {
                    if (val) {
                      setBikeWeightKg(isImperial ? val / KG_TO_LBS : val);
                    }
                  }}
                  suffix={isImperial ? ' lbs' : ' kg'}
                  min={isImperial ? 10 : 5}
                  max={isImperial ? 100 : 45}
                  styles={{
                    input: { backgroundColor: 'var(--tribos-bg-secondary)' },
                  }}
                />
              </Group>

              {/* Surface Type */}
              <Box>
                <Group gap={4} mb={4}>
                  <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                    Surface
                  </Text>
                  {autoSources.surface && (
                    <Badge size="xs" variant="dot" color="teal">from route</Badge>
                  )}
                </Group>
                <SegmentedControl
                  size="xs"
                  fullWidth
                  value={surface}
                  onChange={(v) => {
                    setSurface(v);
                    setAutoSources((prev) => {
                      const next = { ...prev };
                      delete next.surface;
                      return next;
                    });
                  }}
                  data={SURFACE_OPTIONS}
                  styles={{
                    root: { backgroundColor: 'var(--tribos-bg-secondary)' },
                  }}
                />
              </Box>

              {/* Tubeless Toggle */}
              <Group justify="space-between">
                <Box>
                  <Group gap={4}>
                    <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                      Tubeless
                    </Text>
                    {autoSources.tubeless && (
                      <Badge size="xs" variant="dot" color="teal">from gear</Badge>
                    )}
                  </Group>
                  <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                    Allows ~8% lower pressure
                  </Text>
                </Box>
                <Switch
                  checked={tubeless}
                  onChange={(e) => {
                    setTubeless(e.currentTarget.checked);
                    setAutoSources((prev) => {
                      const next = { ...prev };
                      delete next.tubeless;
                      return next;
                    });
                  }}
                  color="terracotta"
                />
              </Group>

              {/* Total Weight Display */}
              <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} ta="center">
                Total: {isImperial
                  ? `${Math.round((riderWeightKg + bikeWeightKg) * KG_TO_LBS)} lbs`
                  : `${Math.round(riderWeightKg + bikeWeightKg)} kg`
                }
              </Text>
            </Stack>
          </Box>
        )}

        {/* Summary */}
        <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }} ta="center">
          {formatPressureSummary(result, unit)}
          {weather?.temperatureCelsius != null && ` @ ${Math.round(weather.temperatureCelsius)}°C`}
        </Text>

        {/* Gear setup prompt */}
        {!gearLoading && gearSetupLoaded && !autoSources.tireWidth && activeBikes.length > 0 && (
          <Text size="xs" style={{ color: 'var(--tribos-text-muted)', fontStyle: 'italic' }} ta="center">
            Add tire specs to your bike in Gear settings for automatic recommendations
          </Text>
        )}
      </Stack>
    </Card>
  );
}
