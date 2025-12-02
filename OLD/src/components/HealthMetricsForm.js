import React, { useState, useEffect } from 'react';
import {
  Modal,
  Card,
  Text,
  Group,
  Stack,
  Button,
  NumberInput,
  Textarea,
  Badge,
  Grid,
  Slider,
  Divider,
  ActionIcon,
  Tooltip,
  Alert,
  LoadingOverlay,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useMediaQuery } from '@mantine/hooks';
import { Heart, Moon, Activity, TrendingUp, X, Plus, Info } from 'lucide-react';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { useUnits } from '../utils/units';
import { convertWeight } from '../utils/units';

/**
 * Health Metrics Form Component
 * Allows users to log daily health and recovery metrics
 */
const HealthMetricsForm = ({ opened, onClose, selectedDate, onSaved }) => {
  const { user } = useAuth();
  const { useImperial, weightUnit } = useUnits();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const [loading, setLoading] = useState(false);
  const [existingMetrics, setExistingMetrics] = useState(null);

  const [formData, setFormData] = useState({
    date: selectedDate || new Date(),
    hrv: null,
    resting_hr: null,
    sleep_hours: null,
    sleep_quality: 5,
    weight_kg: null,
    stress_level: 5,
    energy_level: 5,
    mood_rating: 5,
    muscle_soreness: 3,
    notes: '',
  });

  // Load existing metrics for selected date
  useEffect(() => {
    if (opened && user?.id && formData.date) {
      loadMetricsForDate();
    }
  }, [opened, formData.date, user?.id]);

  const loadMetricsForDate = async () => {
    try {
      const dateStr = formData.date.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('health_metrics')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', dateStr)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found (expected)
        console.error('Error loading metrics:', error);
        return;
      }

      if (data) {
        setExistingMetrics(data);

        // Convert weight to display units
        const displayWeight = data.weight_kg && useImperial
          ? convertWeight.kgToLbs(data.weight_kg)
          : data.weight_kg;

        setFormData({
          date: new Date(data.date),
          hrv: data.hrv,
          resting_hr: data.resting_hr,
          sleep_hours: data.sleep_hours,
          sleep_quality: data.sleep_quality || 5,
          weight_kg: displayWeight,
          stress_level: data.stress_level || 5,
          energy_level: data.energy_level || 5,
          mood_rating: data.mood_rating || 5,
          muscle_soreness: data.muscle_soreness || 3,
          notes: data.notes || '',
        });
      } else {
        setExistingMetrics(null);
      }
    } catch (err) {
      console.error('Failed to load metrics:', err);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);

      const dateStr = formData.date.toISOString().split('T')[0];

      // Convert weight to kg for storage if imperial
      const weightInKg = formData.weight_kg
        ? (useImperial ? convertWeight.lbsToKg(formData.weight_kg) : formData.weight_kg)
        : null;

      const metricsData = {
        user_id: user.id,
        date: dateStr,
        hrv: formData.hrv || null,
        resting_hr: formData.resting_hr || null,
        sleep_hours: formData.sleep_hours || null,
        sleep_quality: formData.sleep_quality,
        weight_kg: weightInKg,
        stress_level: formData.stress_level,
        energy_level: formData.energy_level,
        mood_rating: formData.mood_rating,
        muscle_soreness: formData.muscle_soreness,
        notes: formData.notes || null,
        data_source: 'manual',
      };

      if (existingMetrics) {
        // Update existing
        const { error } = await supabase
          .from('health_metrics')
          .update(metricsData)
          .eq('id', existingMetrics.id);

        if (error) throw error;
        toast.success('Health metrics updated!');
      } else {
        // Insert new
        const { error } = await supabase
          .from('health_metrics')
          .insert([metricsData]);

        if (error) throw error;
        toast.success('Health metrics saved!');
      }

      if (onSaved) onSaved();
      onClose();

    } catch (err) {
      console.error('Failed to save health metrics:', err);
      toast.error('Failed to save metrics');
    } finally {
      setLoading(false);
    }
  };

  const getSliderColor = (value, inverted = false) => {
    if (inverted) {
      // For stress and soreness (lower is better)
      if (value <= 3) return 'green';
      if (value <= 6) return 'yellow';
      return 'red';
    } else {
      // For energy and mood (higher is better)
      if (value >= 7) return 'green';
      if (value >= 4) return 'yellow';
      return 'red';
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group>
          <Activity size={20} />
          <Text fw={600}>Log Health Metrics</Text>
        </Group>
      }
      size={isMobile ? "100%" : "lg"}
      fullScreen={isMobile}
    >
      <LoadingOverlay visible={loading} overlayProps={{ blur: 2 }} loaderProps={{ children: 'Saving health metrics...' }} />
      <Stack gap="md">
        <Alert icon={<Info size={16} />} color="blue" variant="light">
          Track recovery metrics to optimize your training. Fill in what you have - all fields are optional.
        </Alert>

        {/* Date Selector */}
        <DateInput
          label="Date"
          value={formData.date}
          onChange={(date) => setFormData({ ...formData, date })}
          maxDate={new Date()}
          required
        />

        {existingMetrics && (
          <Badge color="green" variant="light">
            Editing existing metrics for this date
          </Badge>
        )}

        <Divider label="Recovery Metrics" labelPosition="left" />

        {/* HRV and Resting HR */}
        <Grid>
          <Grid.Col span={6}>
            <NumberInput
              label={
                <Group gap={4}>
                  <Heart size={14} />
                  <Text size="sm">HRV (ms)</Text>
                </Group>
              }
              description="Heart Rate Variability"
              placeholder="e.g., 55"
              value={formData.hrv}
              onChange={(val) => setFormData({ ...formData, hrv: val })}
              min={0}
              max={300}
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <NumberInput
              label={
                <Group gap={4}>
                  <Heart size={14} />
                  <Text size="sm">Resting HR (bpm)</Text>
                </Group>
              }
              description="Morning resting heart rate"
              placeholder="e.g., 48"
              value={formData.resting_hr}
              onChange={(val) => setFormData({ ...formData, resting_hr: val })}
              min={0}
              max={200}
            />
          </Grid.Col>
        </Grid>

        {/* Sleep */}
        <Grid>
          <Grid.Col span={6}>
            <NumberInput
              label={
                <Group gap={4}>
                  <Moon size={14} />
                  <Text size="sm">Sleep (hours)</Text>
                </Group>
              }
              description="Total sleep last night"
              placeholder="e.g., 7.5"
              value={formData.sleep_hours}
              onChange={(val) => setFormData({ ...formData, sleep_hours: val })}
              min={0}
              max={24}
              step={0.5}
              decimalScale={1}
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <Stack gap={4}>
              <Text size="sm" fw={500}>Sleep Quality</Text>
              <Text size="xs" c="dimmed">1 = poor, 10 = excellent</Text>
              <Slider
                value={formData.sleep_quality}
                onChange={(val) => setFormData({ ...formData, sleep_quality: val })}
                min={1}
                max={10}
                step={1}
                marks={[
                  { value: 1, label: '1' },
                  { value: 5, label: '5' },
                  { value: 10, label: '10' },
                ]}
                color={getSliderColor(formData.sleep_quality)}
              />
            </Stack>
          </Grid.Col>
        </Grid>

        <Divider label="Wellness Metrics" labelPosition="left" />

        {/* Stress Level */}
        <Stack gap={4}>
          <Text size="sm" fw={500}>Stress Level</Text>
          <Text size="xs" c="dimmed">1 = very low, 10 = very high</Text>
          <Slider
            value={formData.stress_level}
            onChange={(val) => setFormData({ ...formData, stress_level: val })}
            min={1}
            max={10}
            step={1}
            marks={[
              { value: 1, label: '1' },
              { value: 5, label: '5' },
              { value: 10, label: '10' },
            ]}
            color={getSliderColor(formData.stress_level, true)}
          />
        </Stack>

        {/* Energy Level */}
        <Stack gap={4}>
          <Text size="sm" fw={500}>Energy Level</Text>
          <Text size="xs" c="dimmed">1 = exhausted, 10 = energized</Text>
          <Slider
            value={formData.energy_level}
            onChange={(val) => setFormData({ ...formData, energy_level: val })}
            min={1}
            max={10}
            step={1}
            marks={[
              { value: 1, label: '1' },
              { value: 5, label: '5' },
              { value: 10, label: '10' },
            ]}
            color={getSliderColor(formData.energy_level)}
          />
        </Stack>

        {/* Mood Rating */}
        <Stack gap={4}>
          <Text size="sm" fw={500}>Mood</Text>
          <Text size="xs" c="dimmed">1 = poor, 10 = excellent</Text>
          <Slider
            value={formData.mood_rating}
            onChange={(val) => setFormData({ ...formData, mood_rating: val })}
            min={1}
            max={10}
            step={1}
            marks={[
              { value: 1, label: '1' },
              { value: 5, label: '5' },
              { value: 10, label: '10' },
            ]}
            color={getSliderColor(formData.mood_rating)}
          />
        </Stack>

        {/* Muscle Soreness */}
        <Stack gap={4}>
          <Text size="sm" fw={500}>Muscle Soreness</Text>
          <Text size="xs" c="dimmed">1 = none, 10 = severe</Text>
          <Slider
            value={formData.muscle_soreness}
            onChange={(val) => setFormData({ ...formData, muscle_soreness: val })}
            min={1}
            max={10}
            step={1}
            marks={[
              { value: 1, label: '1' },
              { value: 5, label: '5' },
              { value: 10, label: '10' },
            ]}
            color={getSliderColor(formData.muscle_soreness, true)}
          />
        </Stack>

        <Divider label="Body Metrics (Optional)" labelPosition="left" />

        {/* Weight */}
        <NumberInput
          label={`Weight (${weightUnit})`}
          placeholder={useImperial ? "e.g., 155" : "e.g., 70.5"}
          value={formData.weight_kg}
          onChange={(val) => setFormData({ ...formData, weight_kg: val })}
          min={0}
          max={useImperial ? 660 : 300}
          decimalScale={1}
          step={useImperial ? 0.5 : 0.1}
        />

        {/* Notes */}
        <Textarea
          label="Notes"
          description="Any additional observations (optional)"
          placeholder="Felt a bit tired today, might need extra recovery..."
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          minRows={2}
          maxRows={4}
        />

        {/* Action Buttons */}
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={loading}>
            {existingMetrics ? 'Update Metrics' : 'Save Metrics'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default HealthMetricsForm;
