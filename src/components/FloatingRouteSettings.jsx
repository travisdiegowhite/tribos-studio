import { useState, useEffect } from 'react';
import {
  Paper,
  Button,
  Stack,
  Group,
  Text,
  Title,
  Select,
  Slider,
  Switch,
  MultiSelect,
  Tabs,
  Badge,
  Alert,
  Box,
  NumberInput,
  ActionIcon,
  Collapse,
  Loader,
  Tooltip,
} from '@mantine/core';
import {
  IconSettings,
  IconRoute,
  IconShield,
  IconMountain,
  IconCamera,
  IconHeart,
  IconAlertCircle,
  IconCloud,
  IconGauge,
  IconX,
  IconRefresh,
  IconBike,
  IconChevronDown,
  IconChevronUp,
} from '@tabler/icons-react';
import { tokens } from '../theme';
import { WEATHER_TOLERANCE_PRESETS, DEFAULT_WEATHER_PRESET, formatTemperature, formatWindSpeed } from '../utils/weather';
import { stravaService } from '../utils/stravaService';
import { notifications } from '@mantine/notifications';

/**
 * FloatingRouteSettings - Route settings card that floats over the map
 * Replaces the modal-based PreferenceSettings
 */
export default function FloatingRouteSettings({
  opened,
  onClose,
  speedProfile,
  onSpeedProfileUpdate,
  isImperial = true,
}) {
  const [activeTab, setActiveTab] = useState('speed');
  const [saving, setSaving] = useState(false);

  // Routing preferences
  const [trafficTolerance, setTrafficTolerance] = useState('low');
  const [hillPreference, setHillPreference] = useState('moderate');
  const [maxGradient, setMaxGradient] = useState(10);
  const [turningPreference, setTurningPreference] = useState('minimal_turns');

  // Surface preferences
  const [surfaceQuality, setSurfaceQuality] = useState('good');
  const [gravelTolerance, setGravelTolerance] = useState(10);
  const [wetWeatherPavedOnly, setWetWeatherPavedOnly] = useState(true);

  // Safety preferences
  const [bikeInfrastructure, setBikeInfrastructure] = useState('strongly_preferred');
  const [restStopFrequency, setRestStopFrequency] = useState(15);
  const [cellCoverage, setCellCoverage] = useState('important');

  // Scenic preferences
  const [scenicImportance, setScenicImportance] = useState('important');
  const [preferredViews, setPreferredViews] = useState(['nature', 'water']);
  const [photographyStops, setPhotographyStops] = useState(true);
  const [quietnessLevel, setQuietnessLevel] = useState('high');

  // Training context
  const [trainingPhase, setTrainingPhase] = useState('base_building');
  const [weeklyVolume, setWeeklyVolume] = useState(100);
  const [fatigueLevel, setFatigueLevel] = useState('fresh');

  // Weather tolerance preferences
  const [weatherTolerance, setWeatherTolerance] = useState(DEFAULT_WEATHER_PRESET);
  const [useWindChill, setUseWindChill] = useState(true);
  const [rainTolerance, setRainTolerance] = useState('light');

  // Speed settings
  const [recalculating, setRecalculating] = useState(false);
  const [useManualSpeed, setUseManualSpeed] = useState(false);
  const [manualSpeed, setManualSpeed] = useState(null);

  // Load existing preferences from localStorage
  useEffect(() => {
    if (!opened) return;

    try {
      const savedPrefs = localStorage.getItem('routePreferences');
      if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs);

        // Routing preferences
        setTrafficTolerance(prefs.trafficTolerance || 'low');
        setHillPreference(prefs.hillPreference || 'moderate');
        setMaxGradient(prefs.maxGradient || 10);
        setTurningPreference(prefs.turningPreference || 'minimal_turns');

        // Surface preferences
        setSurfaceQuality(prefs.surfaceQuality || 'good');
        setGravelTolerance(prefs.gravelTolerance || 10);
        setWetWeatherPavedOnly(prefs.wetWeatherPavedOnly !== false);

        // Safety preferences
        setBikeInfrastructure(prefs.bikeInfrastructure || 'strongly_preferred');
        setRestStopFrequency(prefs.restStopFrequency || 15);
        setCellCoverage(prefs.cellCoverage || 'important');

        // Scenic preferences
        setScenicImportance(prefs.scenicImportance || 'important');
        setPreferredViews(prefs.preferredViews || ['nature', 'water']);
        setPhotographyStops(prefs.photographyStops !== false);
        setQuietnessLevel(prefs.quietnessLevel || 'high');

        // Training context
        setTrainingPhase(prefs.trainingPhase || 'base_building');
        setWeeklyVolume(prefs.weeklyVolume || 100);
        setFatigueLevel(prefs.fatigueLevel || 'fresh');

        // Weather tolerance
        setWeatherTolerance(prefs.weatherTolerance || DEFAULT_WEATHER_PRESET);
        setUseWindChill(prefs.useWindChill !== false);
        setRainTolerance(prefs.rainTolerance || 'light');
      }

      // Load manual speed preference
      const savedManual = localStorage.getItem('tribos-manual-speed');
      if (savedManual) {
        const parsed = JSON.parse(savedManual);
        setUseManualSpeed(parsed.enabled);
        setManualSpeed(parsed.speed);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  }, [opened]);

  // Convert km/h to mph and vice versa
  const toMph = (kmh) => kmh * 0.621371;
  const toKmh = (mph) => mph / 0.621371;

  // Format speed with units
  const formatSpeed = (kmh) => {
    if (!kmh) return 'N/A';
    if (isImperial) {
      return `${toMph(kmh).toFixed(1)} mph`;
    }
    return `${kmh.toFixed(1)} km/h`;
  };

  // Get the effective speed being used
  const getEffectiveSpeed = () => {
    if (useManualSpeed && manualSpeed) {
      return manualSpeed;
    }
    return speedProfile?.average_speed || 28; // Default 28 km/h
  };

  // Save manual speed preference
  const saveManualSpeed = (enabled, speed) => {
    localStorage.setItem('tribos-manual-speed', JSON.stringify({ enabled, speed }));
    setUseManualSpeed(enabled);
    setManualSpeed(speed);

    // Notify parent of the change
    if (onSpeedProfileUpdate) {
      if (enabled && speed) {
        onSpeedProfileUpdate({
          ...speedProfile,
          average_speed: speed,
          manual_override: true,
        });
      } else if (speedProfile) {
        onSpeedProfileUpdate({
          ...speedProfile,
          manual_override: false,
        });
      }
    }
  };

  // Handle recalculate speed profile
  const handleRecalculateSpeed = async () => {
    setRecalculating(true);
    try {
      const profile = await stravaService.calculateSpeedProfile();
      if (profile && onSpeedProfileUpdate) {
        onSpeedProfileUpdate(profile);
        notifications.show({
          title: 'Speed Profile Updated',
          message: `Calculated from ${profile.rides_analyzed || 0} rides`,
          color: 'terracotta',
        });
      }
    } catch (error) {
      console.error('Error recalculating speed:', error);
      notifications.show({
        title: 'Recalculation Failed',
        message: error.message || 'Could not recalculate speed profile',
        color: 'red',
      });
    } finally {
      setRecalculating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const preferences = {
        trafficTolerance,
        hillPreference,
        maxGradient,
        turningPreference,
        surfaceQuality,
        gravelTolerance,
        wetWeatherPavedOnly,
        bikeInfrastructure,
        restStopFrequency,
        cellCoverage,
        scenicImportance,
        preferredViews,
        photographyStops,
        quietnessLevel,
        trainingPhase,
        weeklyVolume,
        fatigueLevel,
        weatherTolerance,
        useWindChill,
        rainTolerance,
      };

      localStorage.setItem('routePreferences', JSON.stringify(preferences));

      notifications.show({
        title: 'Settings Saved',
        message: 'Your route preferences have been saved',
        color: 'terracotta',
      });
      onClose();
    } catch (error) {
      console.error('Error saving preferences:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to save preferences',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!opened) return null;

  const effectiveSpeed = getEffectiveSpeed();
  const speedSource = useManualSpeed && manualSpeed
    ? 'Manual'
    : speedProfile?.average_speed
      ? `From ${speedProfile.rides_analyzed || 0} rides`
      : 'Default';

  return (
    <Paper
      shadow="xl"
      p="md"
      style={{
        position: 'absolute',
        bottom: 80,
        right: 16,
        width: 380,
        maxHeight: 'calc(100vh - 200px)',
        overflowY: 'auto',
        zIndex: 1000,
        backgroundColor: 'var(--tribos-bg-secondary)',
        border: `1px solid ${'var(--tribos-border)'}`,
        borderRadius: tokens.radius.lg,
      }}
    >
      <Stack gap="sm">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <IconSettings size={20} style={{ color: 'var(--tribos-terracotta-500)' }} />
            <Title order={4} style={{ color: 'var(--tribos-text-primary)' }}>
              Route Settings
            </Title>
          </Group>
          <ActionIcon variant="subtle" onClick={onClose}>
            <IconX size={18} />
          </ActionIcon>
        </Group>

        {/* Speed Summary - Always visible */}
        <Paper
          p="sm"
          style={{
            backgroundColor: 'var(--tribos-bg-tertiary)',
            border: `1px solid ${'var(--tribos-terracotta-500)'}40`,
            borderRadius: tokens.radius.md,
          }}
        >
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <IconGauge size={18} style={{ color: 'var(--tribos-terracotta-500)' }} />
              <Text size="sm" fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
                Your Pace
              </Text>
            </Group>
            <Group gap="xs">
              <Text size="lg" fw={700} style={{ color: 'var(--tribos-terracotta-500)' }}>
                {formatSpeed(effectiveSpeed)}
              </Text>
              <Badge size="xs" color="gray" variant="light">
                {speedSource}
              </Badge>
            </Group>
          </Group>
        </Paper>

        {/* Tabs */}
        <Tabs value={activeTab} onChange={setActiveTab} variant="pills" radius="md">
          <Tabs.List grow>
            <Tabs.Tab value="speed" leftSection={<IconGauge size={14} />}>
              Speed
            </Tabs.Tab>
            <Tabs.Tab value="routing" leftSection={<IconRoute size={14} />}>
              Route
            </Tabs.Tab>
            <Tabs.Tab value="safety" leftSection={<IconShield size={14} />}>
              Safety
            </Tabs.Tab>
            <Tabs.Tab value="more" leftSection={<IconSettings size={14} />}>
              More
            </Tabs.Tab>
          </Tabs.List>

          {/* Speed Tab */}
          <Tabs.Panel value="speed" pt="md">
            <Stack gap="sm">
              {/* Speed breakdown */}
              {speedProfile && speedProfile.average_speed && !useManualSpeed && (
                <Box>
                  <Text size="xs" c="dimmed" mb="xs">
                    Speeds calculated from your ride history:
                  </Text>
                  <Group gap="md">
                    <Box>
                      <Text size="xs" c="dimmed">Road</Text>
                      <Text size="sm" fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
                        {formatSpeed(speedProfile.road_speed || speedProfile.average_speed)}
                      </Text>
                    </Box>
                    {speedProfile.gravel_speed && (
                      <Box>
                        <Text size="xs" c="dimmed">Gravel</Text>
                        <Text size="sm" fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
                          {formatSpeed(speedProfile.gravel_speed)}
                        </Text>
                      </Box>
                    )}
                    {speedProfile.mtb_speed && (
                      <Box>
                        <Text size="xs" c="dimmed">MTB</Text>
                        <Text size="sm" fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
                          {formatSpeed(speedProfile.mtb_speed)}
                        </Text>
                      </Box>
                    )}
                  </Group>
                </Box>
              )}

              {/* No profile message */}
              {(!speedProfile || !speedProfile.average_speed) && !useManualSpeed && (
                <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                  <Text size="sm">
                    No ride data found. Connect Strava and sync rides, or set your pace manually below.
                  </Text>
                </Alert>
              )}

              {/* Manual override toggle */}
              <Switch
                label="Set pace manually"
                description="Override calculated speed with your own pace"
                checked={useManualSpeed}
                onChange={(e) => saveManualSpeed(e.currentTarget.checked, manualSpeed || effectiveSpeed)}
                size="sm"
                styles={{
                  label: { color: 'var(--tribos-text-primary)' },
                  description: { color: 'var(--tribos-text-muted)' },
                }}
              />

              {/* Manual speed input */}
              {useManualSpeed && (
                <NumberInput
                  label={`Your average pace (${isImperial ? 'mph' : 'km/h'})`}
                  value={isImperial ? toMph(manualSpeed || effectiveSpeed) : (manualSpeed || effectiveSpeed)}
                  onChange={(val) => {
                    const kmhValue = isImperial ? toKmh(val) : val;
                    saveManualSpeed(true, kmhValue);
                  }}
                  min={5}
                  max={50}
                  step={0.5}
                  decimalScale={1}
                  leftSection={<IconBike size={16} />}
                  styles={{
                    input: {
                      backgroundColor: 'var(--tribos-bg-tertiary)',
                      borderColor: 'var(--tribos-border)',
                      color: 'var(--tribos-text-primary)',
                    },
                    label: { color: 'var(--tribos-text-secondary)' },
                  }}
                />
              )}

              {/* Recalculate button */}
              {!useManualSpeed && (
                <Button
                  variant="light"
                  size="sm"
                  leftSection={recalculating ? <Loader size={14} /> : <IconRefresh size={14} />}
                  onClick={handleRecalculateSpeed}
                  disabled={recalculating}
                  fullWidth
                >
                  {recalculating ? 'Calculating...' : 'Recalculate from Rides'}
                </Button>
              )}

              <Text size="xs" c="dimmed">
                Your pace is used to calculate route distances from workout durations.
              </Text>
            </Stack>
          </Tabs.Panel>

          {/* Routing Tab */}
          <Tabs.Panel value="routing" pt="md">
            <Stack gap="sm">
              <Select
                label="Traffic Tolerance"
                description="How comfortable riding near traffic?"
                value={trafficTolerance}
                onChange={setTrafficTolerance}
                size="xs"
                data={[
                  { value: 'low', label: 'Low - Avoid busy roads' },
                  { value: 'medium', label: 'Medium - Some traffic okay' },
                  { value: 'high', label: 'High - Any road type' },
                ]}
                styles={{
                  input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                  label: { color: 'var(--tribos-text-secondary)' },
                  description: { color: 'var(--tribos-text-muted)' },
                }}
              />

              <Select
                label="Hill Preference"
                value={hillPreference}
                onChange={setHillPreference}
                size="xs"
                data={[
                  { value: 'avoid', label: 'Avoid - Keep it flat' },
                  { value: 'moderate', label: 'Moderate - Some hills okay' },
                  { value: 'seek', label: 'Seek - Love climbing!' },
                ]}
                styles={{
                  input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                  label: { color: 'var(--tribos-text-secondary)' },
                }}
              />

              <Box>
                <Text size="xs" fw={500} mb={4} style={{ color: 'var(--tribos-text-secondary)' }}>
                  Max Gradient: {maxGradient}%
                </Text>
                <Slider
                  value={maxGradient}
                  onChange={setMaxGradient}
                  min={5}
                  max={20}
                  marks={[
                    { value: 5, label: '5%' },
                    { value: 10, label: '10%' },
                    { value: 15, label: '15%' },
                    { value: 20, label: '20%' },
                  ]}
                  size="sm"
                />
              </Box>

              <Select
                label="Surface Quality"
                value={surfaceQuality}
                onChange={setSurfaceQuality}
                size="xs"
                data={[
                  { value: 'excellent', label: 'Smooth pavement only' },
                  { value: 'good', label: 'Minor imperfections okay' },
                  { value: 'fair', label: 'Rough roads acceptable' },
                  { value: 'poor_ok', label: 'Any - Adventure ready' },
                ]}
                styles={{
                  input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                  label: { color: 'var(--tribos-text-secondary)' },
                }}
              />
            </Stack>
          </Tabs.Panel>

          {/* Safety Tab */}
          <Tabs.Panel value="safety" pt="md">
            <Stack gap="sm">
              <Select
                label="Bike Infrastructure"
                description="Preference for bike lanes and paths"
                value={bikeInfrastructure}
                onChange={setBikeInfrastructure}
                size="xs"
                data={[
                  { value: 'required', label: 'Required - Must have bike infrastructure' },
                  { value: 'strongly_preferred', label: 'Strongly Preferred' },
                  { value: 'preferred', label: 'Preferred - Nice to have' },
                  { value: 'flexible', label: 'Flexible - Any road' },
                ]}
                styles={{
                  input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                  label: { color: 'var(--tribos-text-secondary)' },
                  description: { color: 'var(--tribos-text-muted)' },
                }}
              />

              <Select
                label="Quietness Level"
                description="Avoid noise and find peaceful routes"
                value={quietnessLevel}
                onChange={setQuietnessLevel}
                size="xs"
                data={[
                  { value: 'high', label: 'High - Prioritize quiet roads' },
                  { value: 'medium', label: 'Medium - Balance quiet/efficiency' },
                  { value: 'low', label: 'Low - Noise not a concern' },
                ]}
                styles={{
                  input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                  label: { color: 'var(--tribos-text-secondary)' },
                  description: { color: 'var(--tribos-text-muted)' },
                }}
              />

              <Select
                label="Cell Coverage"
                value={cellCoverage}
                onChange={setCellCoverage}
                size="xs"
                data={[
                  { value: 'critical', label: 'Critical - Always needed' },
                  { value: 'important', label: 'Important - Mostly needed' },
                  { value: 'nice_to_have', label: 'Nice to have' },
                  { value: 'not_important', label: 'Not important' },
                ]}
                styles={{
                  input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                  label: { color: 'var(--tribos-text-secondary)' },
                }}
              />
            </Stack>
          </Tabs.Panel>

          {/* More Tab (Scenic, Training, Weather) */}
          <Tabs.Panel value="more" pt="md">
            <Stack gap="md">
              {/* Scenic Section */}
              <Box>
                <Group gap="xs" mb="xs">
                  <IconCamera size={14} style={{ color: 'var(--tribos-terracotta-500)' }} />
                  <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>Scenic</Text>
                </Group>
                <Stack gap="xs">
                  <Select
                    label="Scenic Importance"
                    value={scenicImportance}
                    onChange={setScenicImportance}
                    size="xs"
                    data={[
                      { value: 'critical', label: 'Critical - Must be beautiful' },
                      { value: 'important', label: 'Important - Prefer scenic' },
                      { value: 'nice_to_have', label: 'Nice to have' },
                      { value: 'not_important', label: 'Not important' },
                    ]}
                    styles={{
                      input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                      label: { color: 'var(--tribos-text-secondary)' },
                    }}
                  />
                  <MultiSelect
                    label="Preferred Views"
                    value={preferredViews}
                    onChange={setPreferredViews}
                    size="xs"
                    data={[
                      { value: 'nature', label: 'Nature' },
                      { value: 'water', label: 'Water' },
                      { value: 'mountains', label: 'Mountains' },
                      { value: 'farmland', label: 'Farmland' },
                    ]}
                    styles={{
                      input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                      label: { color: 'var(--tribos-text-secondary)' },
                    }}
                  />
                </Stack>
              </Box>

              {/* Training Section */}
              <Box>
                <Group gap="xs" mb="xs">
                  <IconHeart size={14} style={{ color: 'var(--tribos-terracotta-500)' }} />
                  <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>Training</Text>
                </Group>
                <Stack gap="xs">
                  <Select
                    label="Training Phase"
                    value={trainingPhase}
                    onChange={setTrainingPhase}
                    size="xs"
                    data={[
                      { value: 'base_building', label: 'Base Building' },
                      { value: 'build', label: 'Build Phase' },
                      { value: 'peak', label: 'Peak/Race Phase' },
                      { value: 'recovery', label: 'Recovery' },
                      { value: 'maintenance', label: 'Maintenance' },
                    ]}
                    styles={{
                      input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                      label: { color: 'var(--tribos-text-secondary)' },
                    }}
                  />
                  <Select
                    label="Fatigue Level"
                    value={fatigueLevel}
                    onChange={setFatigueLevel}
                    size="xs"
                    data={[
                      { value: 'fresh', label: 'Fresh - Ready for anything' },
                      { value: 'moderate', label: 'Moderate - Normal tiredness' },
                      { value: 'tired', label: 'Tired - Need easier rides' },
                      { value: 'exhausted', label: 'Exhausted - Recovery only' },
                    ]}
                    styles={{
                      input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                      label: { color: 'var(--tribos-text-secondary)' },
                    }}
                  />
                </Stack>
              </Box>

              {/* Weather Section */}
              <Box>
                <Group gap="xs" mb="xs">
                  <IconCloud size={14} style={{ color: 'var(--tribos-terracotta-500)' }} />
                  <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>Weather</Text>
                </Group>
                <Stack gap="xs">
                  <Select
                    label="Weather Tolerance"
                    value={weatherTolerance}
                    onChange={setWeatherTolerance}
                    size="xs"
                    data={Object.values(WEATHER_TOLERANCE_PRESETS).map((preset) => ({
                      value: preset.id,
                      label: preset.name,
                    }))}
                    styles={{
                      input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                      label: { color: 'var(--tribos-text-secondary)' },
                    }}
                  />
                  <Select
                    label="Rain Tolerance"
                    value={rainTolerance}
                    onChange={setRainTolerance}
                    size="xs"
                    data={[
                      { value: 'none', label: 'None - Avoid wet conditions' },
                      { value: 'light', label: 'Light - Drizzle is okay' },
                      { value: 'any', label: 'Any - Rain doesn\'t bother me' },
                    ]}
                    styles={{
                      input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                      label: { color: 'var(--tribos-text-secondary)' },
                    }}
                  />
                </Stack>
              </Box>
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {/* Save Button */}
        <Button
          color="terracotta"
          onClick={handleSave}
          loading={saving}
          fullWidth
        >
          Save Settings
        </Button>
      </Stack>
    </Paper>
  );
}

/**
 * Floating button to open route settings
 */
export function RouteSettingsButton({ onClick, speedProfile, isImperial = true }) {
  // Get effective speed for display
  const getEffectiveSpeed = () => {
    try {
      const savedManual = localStorage.getItem('tribos-manual-speed');
      if (savedManual) {
        const parsed = JSON.parse(savedManual);
        if (parsed.enabled && parsed.speed) {
          return { speed: parsed.speed, source: 'manual' };
        }
      }
    } catch (e) {}

    if (speedProfile?.average_speed) {
      return { speed: speedProfile.average_speed, source: 'profile' };
    }
    return { speed: 28, source: 'default' };
  };

  const { speed, source } = getEffectiveSpeed();
  const displaySpeed = isImperial ? (speed * 0.621371).toFixed(0) : speed.toFixed(0);
  const unit = isImperial ? 'mph' : 'km/h';

  return (
    <Tooltip label="Route Settings & Pace">
      <Button
        variant="filled"
        color="dark"
        size="md"
        onClick={onClick}
        leftSection={<IconGauge size={18} />}
        style={{
          backgroundColor: 'var(--tribos-bg-secondary)',
          border: `1px solid ${'var(--tribos-border)'}`,
          color: 'var(--tribos-text-100)',
        }}
      >
        <Group gap={4}>
          <Text size="sm" fw={600} c="var(--tribos-text-100)">{displaySpeed}</Text>
          <Text size="xs" c="var(--tribos-text-300)">{unit}</Text>
        </Group>
      </Button>
    </Tooltip>
  );
}
