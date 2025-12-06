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
} from '@mantine/core';
import {
  IconHeart,
  IconMoon,
  IconBolt,
  IconStretching,
  IconBrain,
  IconScale,
  IconCheck,
  IconBattery,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext.jsx';

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

function HealthCheckInModal({ opened, onClose, onSave, existingData }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    resting_hr: null,
    hrv_ms: null,
    sleep_hours: null,
    sleep_quality: 3,
    energy_level: 3,
    muscle_soreness: 1,
    stress_level: 3,
    weight_kg: null,
    body_battery: null,
    notes: '',
  });

  // Load existing data if editing
  useEffect(() => {
    if (existingData) {
      setFormData({
        resting_hr: existingData.resting_hr || null,
        hrv_ms: existingData.hrv_ms || null,
        sleep_hours: existingData.sleep_hours || null,
        sleep_quality: existingData.sleep_quality || 3,
        energy_level: existingData.energy_level || 3,
        muscle_soreness: existingData.muscle_soreness || 1,
        stress_level: existingData.stress_level || 3,
        weight_kg: existingData.weight_kg || null,
        body_battery: existingData.body_battery || null,
        notes: existingData.notes || '',
      });
    }
  }, [existingData]);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('health_metrics')
        .upsert({
          user_id: user.id,
          metric_date: today,
          source: 'manual',
          ...formData,
        }, {
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

        {/* Core Metrics */}
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <NumberInput
            label="Resting HR"
            placeholder="bpm"
            leftSection={<IconHeart size={14} />}
            value={formData.resting_hr || ''}
            onChange={(v) => updateField('resting_hr', v || null)}
            min={30}
            max={120}
            suffix=" bpm"
          />
          <NumberInput
            label="HRV"
            placeholder="ms"
            leftSection={<IconBolt size={14} />}
            value={formData.hrv_ms || ''}
            onChange={(v) => updateField('hrv_ms', v || null)}
            min={0}
            max={200}
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

        {/* Optional */}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <NumberInput
            label="Weight (optional)"
            placeholder="kg"
            leftSection={<IconScale size={14} />}
            value={formData.weight_kg || ''}
            onChange={(v) => updateField('weight_kg', v || null)}
            min={30}
            max={200}
            decimalScale={1}
            suffix=" kg"
          />
          <NumberInput
            label="Body Battery (optional)"
            placeholder="0-100"
            leftSection={<IconBattery size={14} />}
            value={formData.body_battery || ''}
            onChange={(v) => updateField('body_battery', v || null)}
            min={0}
            max={100}
          />
        </SimpleGrid>

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

    // HRV contribution
    if (formData.hrv_ms) {
      score += Math.min(25, formData.hrv_ms / 4);
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
