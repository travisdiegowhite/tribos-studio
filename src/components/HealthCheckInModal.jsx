import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  Slider,
  NumberInput,
  Textarea,
  Paper,
  SimpleGrid,
  ThemeIcon,
  Badge,
  Divider,
  SegmentedControl,
  Alert,
  Loader,
  Collapse,
  Box,
} from '@mantine/core';
import {
  IconHeart,
  IconMoon,
  IconBolt,
  IconStretching,
  IconBrain,
  IconScale,
  IconCheck,
  IconBrandSpeedtest,
  IconInfoCircle,
  IconRefresh,
  IconBrandApple,
  IconFlame,
  IconChevronUp,
  IconChevronDown,
  IconDroplet,
  IconMeat,
  IconToolsKitchen2,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useUserPreferences } from '../contexts/UserPreferencesContext.jsx';
import { garminService } from '../utils/garminService';

const EMOJI_SCALE = {
  1: { emoji: '1', label: 'Very Low', color: 'red' },
  2: { emoji: '2', label: 'Low', color: 'orange' },
  3: { emoji: '3', label: 'Moderate', color: 'yellow' },
  4: { emoji: '4', label: 'Good', color: 'lime' },
  5: { emoji: '5', label: 'Excellent', color: 'green' },
};

const SORENESS_SCALE = {
  1: { label: 'None', color: 'green' },
  2: { label: 'Mild', color: 'lime' },
  3: { label: 'Moderate', color: 'yellow' },
  4: { label: 'Significant', color: 'orange' },
  5: { label: 'Severe', color: 'red' },
};

// Fueling options
const MEALS_OPTIONS = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5+' },
];

const PROTEIN_OPTIONS = [
  { value: 'yes', label: '✓ Yes', color: 'green' },
  { value: 'kinda', label: '~ Some', color: 'yellow' },
  { value: 'no', label: '✗ No', color: 'red' },
];

const HYDRATION_OPTIONS = [
  { value: 'low', label: '🥵 Low', color: 'red' },
  { value: 'ok', label: '👌 OK', color: 'yellow' },
  { value: 'good', label: '💧 Good', color: 'green' },
];

const PRE_WORKOUT_OPTIONS = [
  { value: 'yes', label: 'Yes, fueled' },
  { value: 'no', label: 'No, skipped' },
  { value: 'no_workout', label: 'No workout' },
];

// Weight conversion helpers
const KG_TO_LBS = 2.20462;
const LBS_TO_KG = 0.453592;

function HealthCheckInModal({ opened, onClose, onSave, existingData }) {
  const { user } = useAuth();
  const { unitsPreference } = useUserPreferences();
  const isImperial = unitsPreference === 'imperial';
  const [loading, setLoading] = useState(false);
  const [garminConnected, setGarminConnected] = useState(false);
  const [garminLoading, setGarminLoading] = useState(false);
  const [formData, setFormData] = useState({
    resting_heart_rate: null,
    hrv_score: null,
    sleep_hours: null,
    sleep_quality: 3,
    energy_level: 3,
    muscle_soreness: 1,
    stress_level: 3,
    weight_kg: null,
    notes: '',
    // Fueling fields
    meals_eaten: null,
    protein_at_meals: null,
    hydration_level: null,
    pre_workout_fuel: null,
  });

  // For display - store weight in user's preferred unit
  const [displayWeight, setDisplayWeight] = useState(null);
  const [showFueling, setShowFueling] = useState(false);

  // Check Garmin connection status when modal opens
  useEffect(() => {
    if (opened) {
      garminService.getConnectionStatus().then(status => {
        setGarminConnected(status.connected && !status.tokenExpired);
      });
    }
  }, [opened]);

  // Load existing data if editing (handle both mapped and production column names)
  useEffect(() => {
    if (existingData) {
      const weightKg = existingData.weight_kg || null;
      setFormData({
        // Support both mapped names and production column names
        resting_heart_rate: existingData.resting_heart_rate || existingData.resting_hr || null,
        hrv_score: existingData.hrv_score || existingData.hrv_ms || null,
        sleep_hours: existingData.sleep_hours || null,
        sleep_quality: existingData.sleep_quality || 3,
        energy_level: existingData.energy_level || 3,
        muscle_soreness: existingData.muscle_soreness || 1,
        stress_level: existingData.stress_level || 3,
        weight_kg: weightKg,
        notes: existingData.notes || '',
        // Fueling fields
        meals_eaten: existingData.meals_eaten || null,
        protein_at_meals: existingData.protein_at_meals || null,
        hydration_level: existingData.hydration_level || null,
        pre_workout_fuel: existingData.pre_workout_fuel || null,
      });
      // Convert weight for display
      setDisplayWeight(weightKg ? (isImperial ? Math.round(weightKg * KG_TO_LBS * 10) / 10 : weightKg) : null);
      // Show fueling section if there's existing fueling data
      if (existingData.meals_eaten || existingData.protein_at_meals || existingData.hydration_level || existingData.pre_workout_fuel) {
        setShowFueling(true);
      }
    }
  }, [existingData, isImperial]);

  // Sync data from Garmin
  const handleGarminSync = async () => {
    setGarminLoading(true);
    try {
      const result = await garminService.getHealthData();

      if (!result.success) {
        // Check if user needs to reconnect their Garmin account
        if (result.requiresReconnect || result.authError) {
          notifications.show({
            title: 'Garmin Connection Expired',
            message: result.message || 'Please go to Settings > Integrations to disconnect and reconnect your Garmin account.',
            color: 'red',
            autoClose: 10000
          });
          // Update connection status
          setGarminConnected(false);
          return;
        }
        notifications.show({
          title: 'Garmin Sync',
          message: result.error || 'Could not fetch data from Garmin',
          color: 'orange'
        });
        return;
      }

      if (!result.hasData) {
        notifications.show({
          title: 'No Data Available',
          message: 'No health data found in Garmin for today. Make sure you\'ve synced your device.',
          color: 'yellow'
        });
        return;
      }

      const garminData = result.healthData;
      let updatedFields = 0;

      // Update form with Garmin data (only non-null values)
      if (garminData.resting_heart_rate != null) {
        updateField('resting_heart_rate', garminData.resting_heart_rate);
        updatedFields++;
      }
      if (garminData.hrv_score != null) {
        updateField('hrv_score', garminData.hrv_score);
        updatedFields++;
      }
      if (garminData.sleep_hours != null) {
        updateField('sleep_hours', garminData.sleep_hours);
        updatedFields++;
      }
      if (garminData.sleep_quality != null) {
        updateField('sleep_quality', garminData.sleep_quality);
        updatedFields++;
      }
      if (garminData.stress_level != null) {
        updateField('stress_level', garminData.stress_level);
        updatedFields++;
      }
      if (garminData.weight_kg != null) {
        updateField('weight_kg', garminData.weight_kg);
        // Update display weight
        setDisplayWeight(isImperial ? Math.round(garminData.weight_kg * KG_TO_LBS * 10) / 10 : garminData.weight_kg);
        updatedFields++;
      }

      notifications.show({
        title: 'Garmin Data Synced',
        message: `Updated ${updatedFields} field${updatedFields !== 1 ? 's' : ''} from Garmin`,
        color: 'teal',
        icon: <IconCheck size={16} />
      });

    } catch (error) {
      console.error('Garmin sync error:', error);
      notifications.show({
        title: 'Sync Error',
        message: 'Failed to sync data from Garmin',
        color: 'red'
      });
    } finally {
      setGarminLoading(false);
    }
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Handle weight input change - convert to kg for storage
  const handleWeightChange = (value) => {
    setDisplayWeight(value || null);
    if (value) {
      // Convert to kg for storage
      const weightKg = isImperial ? value * LBS_TO_KG : value;
      updateField('weight_kg', Math.round(weightKg * 100) / 100);
    } else {
      updateField('weight_kg', null);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // Use production column names (metric_date, resting_hr, hrv_ms)
      const dataToSave = {
        user_id: user.id,
        metric_date: today,
        resting_hr: formData.resting_heart_rate,
        hrv_ms: formData.hrv_score,
        sleep_hours: formData.sleep_hours,
        sleep_quality: formData.sleep_quality,
        energy_level: formData.energy_level,
        muscle_soreness: formData.muscle_soreness,
        stress_level: formData.stress_level,
        weight_kg: formData.weight_kg,
        notes: formData.notes || null,
        source: 'manual',
        // Fueling fields
        meals_eaten: formData.meals_eaten,
        protein_at_meals: formData.protein_at_meals,
        hydration_level: formData.hydration_level,
        pre_workout_fuel: formData.pre_workout_fuel,
      };

      const { data, error } = await supabase
        .from('health_metrics')
        .upsert(dataToSave, {
          onConflict: 'user_id,metric_date',
        })
        .select()
        .single();

      if (error) throw error;

      notifications.show({
        title: 'Check-in Saved',
        message: 'Your health metrics have been recorded',
        color: 'green',
        icon: <IconCheck size={16} />,
      });

      onSave?.(data);
      onClose();
    } catch (error) {
      console.error('Error saving health check-in:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to save check-in. Please try again.',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const renderScaleSelector = (field, label, icon, scale = EMOJI_SCALE, inverted = false) => {
    const value = formData[field];
    const scaleData = scale[value];

    return (
      <Paper withBorder p="sm">
        <Group justify="space-between" mb="xs">
          <Group gap="xs">
            <ThemeIcon size="sm" variant="light" color={scaleData?.color || 'gray'}>
              {icon}
            </ThemeIcon>
            <Text size="sm" fw={500}>{label}</Text>
          </Group>
          <Badge color={scaleData?.color || 'gray'} variant="light" size="sm">
            {scaleData?.label || 'Select'}
          </Badge>
        </Group>
        <SegmentedControl
          fullWidth
          size="xs"
          value={String(value)}
          onChange={(v) => updateField(field, parseInt(v))}
          data={Object.entries(scale).map(([k, v]) => ({
            value: k,
            label: inverted ? String(6 - parseInt(k)) : k,
          }))}
        />
      </Paper>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <ThemeIcon color="violet" variant="light">
            <IconHeart size={18} />
          </ThemeIcon>
          <Text fw={600}>Daily Check-in</Text>
        </Group>
      }
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Log how you're feeling today. This helps personalize your training recommendations.
        </Text>

        {garminConnected ? (
          <Alert variant="light" color="teal" icon={<IconCheck size={16} />} p="xs">
            <Text size="xs">
              <strong>Garmin connected</strong> - Health data (HR, sleep, HRV, weight) syncs automatically when you sync your device. Any Garmin data will appear below.
            </Text>
          </Alert>
        ) : (
          <Alert variant="light" color="blue" icon={<IconInfoCircle size={16} />} p="xs">
            <Text size="xs">
              Connect Garmin in Settings to auto-sync health data, or enter values manually from your Garmin Connect app.
            </Text>
          </Alert>
        )}

        {/* Core Metrics */}
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <NumberInput
            label="Resting HR"
            placeholder="bpm"
            leftSection={<IconHeart size={14} />}
            value={formData.resting_heart_rate || ''}
            onChange={(v) => updateField('resting_heart_rate', v || null)}
            min={30}
            max={120}
            suffix=" bpm"
          />
          <NumberInput
            label="HRV"
            placeholder="ms"
            leftSection={<IconBrandSpeedtest size={14} />}
            value={formData.hrv_score || ''}
            onChange={(v) => updateField('hrv_score', v || null)}
            min={0}
            max={200}
            suffix=" ms"
          />
          <NumberInput
            label="Sleep Hours"
            placeholder="hours"
            leftSection={<IconMoon size={14} />}
            value={formData.sleep_hours || ''}
            onChange={(v) => updateField('sleep_hours', v || null)}
            min={0}
            max={14}
            decimalScale={1}
            step={0.5}
          />
        </SimpleGrid>

        <Divider label="How do you feel?" labelPosition="center" />

        {/* Subjective Metrics */}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {renderScaleSelector('sleep_quality', 'Sleep Quality', <IconMoon size={14} />)}
          {renderScaleSelector('energy_level', 'Energy Level', <IconBolt size={14} />)}
          {renderScaleSelector('stress_level', 'Stress Level', <IconBrain size={14} />, {
            1: { label: 'Very Low', color: 'green' },
            2: { label: 'Low', color: 'lime' },
            3: { label: 'Moderate', color: 'yellow' },
            4: { label: 'High', color: 'orange' },
            5: { label: 'Very High', color: 'red' },
          })}
          {renderScaleSelector('muscle_soreness', 'Muscle Soreness', <IconStretching size={14} />, SORENESS_SCALE)}
        </SimpleGrid>

        <Divider />

        {/* Optional - Weight */}
        <NumberInput
          label={`Weight (optional)`}
          placeholder={isImperial ? 'lbs' : 'kg'}
          leftSection={<IconScale size={14} />}
          value={displayWeight || ''}
          onChange={handleWeightChange}
          min={isImperial ? 66 : 30}
          max={isImperial ? 440 : 200}
          decimalScale={1}
          suffix={isImperial ? ' lbs' : ' kg'}
          description={isImperial ? 'Stored as kg internally' : null}
        />

        {/* Fueling Check Section - Collapsible */}
        <Box>
          <Button
            variant="subtle"
            size="sm"
            onClick={() => setShowFueling(!showFueling)}
            leftSection={<Text size="sm">🍌</Text>}
            rightSection={showFueling ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            style={{ marginBottom: showFueling ? 8 : 0 }}
          >
            Fueling Check (optional)
          </Button>

          <Collapse in={showFueling}>
            <Paper withBorder p="md" radius="md">
              <Stack gap="md">
                <Text size="xs" c="dimmed">
                  Quick fueling check to help identify energy patterns. No calorie counting needed!
                </Text>

                {/* Meals eaten */}
                <Box>
                  <Group gap="xs" mb={6}>
                    <ThemeIcon size="sm" variant="light" color="orange">
                      <IconToolsKitchen2 size={14} />
                    </ThemeIcon>
                    <Text size="sm" fw={500}>How many meals yesterday?</Text>
                  </Group>
                  <SegmentedControl
                    fullWidth
                    size="sm"
                    value={formData.meals_eaten ? String(formData.meals_eaten) : ''}
                    onChange={(v) => updateField('meals_eaten', v ? parseInt(v) : null)}
                    data={MEALS_OPTIONS}
                  />
                </Box>

                {/* Protein at meals */}
                <Box>
                  <Group gap="xs" mb={6}>
                    <ThemeIcon size="sm" variant="light" color="red">
                      <IconMeat size={14} />
                    </ThemeIcon>
                    <Text size="sm" fw={500}>Protein at most meals?</Text>
                  </Group>
                  <SegmentedControl
                    fullWidth
                    size="sm"
                    value={formData.protein_at_meals || ''}
                    onChange={(v) => updateField('protein_at_meals', v || null)}
                    data={PROTEIN_OPTIONS}
                  />
                </Box>

                {/* Hydration */}
                <Box>
                  <Group gap="xs" mb={6}>
                    <ThemeIcon size="sm" variant="light" color="blue">
                      <IconDroplet size={14} />
                    </ThemeIcon>
                    <Text size="sm" fw={500}>Hydration yesterday?</Text>
                  </Group>
                  <SegmentedControl
                    fullWidth
                    size="sm"
                    value={formData.hydration_level || ''}
                    onChange={(v) => updateField('hydration_level', v || null)}
                    data={HYDRATION_OPTIONS}
                  />
                </Box>

                {/* Pre-workout fuel */}
                <Box>
                  <Group gap="xs" mb={6}>
                    <ThemeIcon size="sm" variant="light" color="lime">
                      <IconFlame size={14} />
                    </ThemeIcon>
                    <Text size="sm" fw={500}>Pre-workout fueling?</Text>
                  </Group>
                  <SegmentedControl
                    fullWidth
                    size="sm"
                    value={formData.pre_workout_fuel || ''}
                    onChange={(v) => updateField('pre_workout_fuel', v || null)}
                    data={PRE_WORKOUT_OPTIONS}
                  />
                </Box>
              </Stack>
            </Paper>
          </Collapse>
        </Box>

        <Textarea
          label="Notes (optional)"
          placeholder="Anything else to note? Illness, travel, life stress..."
          value={formData.notes}
          onChange={(e) => updateField('notes', e.target.value)}
          minRows={2}
        />

        {/* Readiness Preview */}
        <Paper p="sm" style={{ backgroundColor: 'var(--mantine-color-dark-6)' }}>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">Estimated Readiness</Text>
            <ReadinessPreview formData={formData} />
          </Group>
        </Paper>

        {/* Actions */}
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="violet"
            loading={loading}
            onClick={handleSave}
            leftSection={<IconCheck size={16} />}
          >
            Save Check-in
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// Calculate readiness preview (mirrors the database function)
function ReadinessPreview({ formData }) {
  const calculateReadiness = () => {
    let score = 0;
    let factorCount = 0;

    // Sleep hours (7-9 optimal)
    if (formData.sleep_hours) {
      const sleepScore = formData.sleep_hours >= 7 && formData.sleep_hours <= 9 ? 25 :
        formData.sleep_hours >= 6 ? 20 :
        formData.sleep_hours >= 5 ? 15 : 10;
      score += sleepScore;
      factorCount++;
    }

    // Sleep quality (1-5 to 0-25)
    if (formData.sleep_quality) {
      score += formData.sleep_quality * 5;
      factorCount++;
    }

    // Energy (1-5 to 0-25)
    if (formData.energy_level) {
      score += formData.energy_level * 5;
      factorCount++;
    }

    // Soreness (inverted)
    if (formData.muscle_soreness) {
      score += (6 - formData.muscle_soreness) * 5;
      factorCount++;
    }

    // Stress (inverted)
    if (formData.stress_level) {
      score += (6 - formData.stress_level) * 5;
      factorCount++;
    }

    // HRV contribution (using hrv_score which is what the DB stores)
    if (formData.hrv_score) {
      score += Math.min(25, formData.hrv_score / 4);
      factorCount++;
    }

    if (factorCount === 0) return null;
    return Math.round((score / (factorCount * 25)) * 100);
  };

  const readiness = calculateReadiness();

  if (readiness === null) {
    return <Text size="sm" c="dimmed">--</Text>;
  }

  const getColor = (r) => {
    if (r >= 80) return 'green';
    if (r >= 60) return 'lime';
    if (r >= 40) return 'yellow';
    if (r >= 20) return 'orange';
    return 'red';
  };

  const getLabel = (r) => {
    if (r >= 80) return 'Ready to Train Hard';
    if (r >= 60) return 'Good for Training';
    if (r >= 40) return 'Moderate - Easy Day';
    if (r >= 20) return 'Recovery Recommended';
    return 'Rest Day Advised';
  };

  return (
    <Group gap="xs">
      <Badge color={getColor(readiness)} variant="filled" size="lg">
        {readiness}%
      </Badge>
      <Text size="xs" c="dimmed">{getLabel(readiness)}</Text>
    </Group>
  );
}

export default HealthCheckInModal;
