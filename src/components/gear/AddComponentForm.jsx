import { useState, useEffect } from 'react';
import {
  Paper,
  TextInput,
  NumberInput,
  Stack,
  Group,
  Button,
  Select,
  Text,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { COMPONENT_TYPES, METERS_PER_MILE } from './gearConstants';

// Default thresholds in miles for display (matching api/utils/gearDefaults.js)
const DEFAULT_THRESHOLDS_MILES = {
  chain: { warning: 1200, replace: 1500 },
  cassette: { warning: 2400, replace: 3000 },
  tires_road: { warning: 2000, replace: 2500 },
  tires_gravel: { warning: 1200, replace: 1500 },
  brake_pads_rim: { warning: 1200, replace: 1500 },
  brake_pads_disc: { warning: 1600, replace: 2000 },
  bar_tape: { warning: null, replace: null },
  cables: { warning: 2400, replace: 3000 },
};

/**
 * Inline collapsible form for adding a component to a bike.
 * Replaces the previous AddComponentModal to avoid modal stacking issues.
 */
export default function AddComponentForm({ opened, onCancel, onSave, gearItemId }) {
  const [componentType, setComponentType] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [installedDate, setInstalledDate] = useState(new Date());
  const [warningMiles, setWarningMiles] = useState(null);
  const [replaceMiles, setReplaceMiles] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Auto-populate thresholds when component type changes
  useEffect(() => {
    if (componentType) {
      const defaults = DEFAULT_THRESHOLDS_MILES[componentType];
      if (defaults) {
        setWarningMiles(defaults.warning);
        setReplaceMiles(defaults.replace);
      } else {
        setWarningMiles(null);
        setReplaceMiles(null);
      }
    }
  }, [componentType]);

  const reset = () => {
    setComponentType('');
    setBrand('');
    setModel('');
    setInstalledDate(new Date());
    setWarningMiles(null);
    setReplaceMiles(null);
    setNotes('');
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const handleSubmit = async () => {
    if (!componentType || !gearItemId) return;
    setSaving(true);
    try {
      await onSave({
        gearItemId,
        componentType,
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        installedDate: installedDate ? installedDate.toISOString().split('T')[0] : undefined,
        // Convert miles to meters for the API
        warningThreshold: warningMiles ? warningMiles * METERS_PER_MILE : undefined,
        replaceThreshold: replaceMiles ? replaceMiles * METERS_PER_MILE : undefined,
        notes: notes.trim() || undefined,
      });
      reset();
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err?.message || 'Failed to add component',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const isBarTape = componentType === 'bar_tape';

  if (!opened) return null;

  return (
    <Paper withBorder p="md" radius="md" mt="sm">
      <Stack gap="md">
        <Text fw={500}>Add Component</Text>

        <Select
          label="Component Type"
          placeholder="Select component"
          data={COMPONENT_TYPES}
          value={componentType}
          onChange={(v) => setComponentType(v || '')}
          comboboxProps={{ withinPortal: false }}
          required
        />

        <Group grow>
          <TextInput
            label="Brand"
            placeholder="e.g. Shimano"
            value={brand}
            onChange={(e) => setBrand(e.currentTarget.value)}
          />
          <TextInput
            label="Model"
            placeholder="e.g. CN-HG601"
            value={model}
            onChange={(e) => setModel(e.currentTarget.value)}
          />
        </Group>

        <DateInput
          label="Installed Date"
          value={installedDate}
          onChange={setInstalledDate}
          popoverProps={{ withinPortal: false }}
        />

        {isBarTape ? (
          <Text size="sm" c="dimmed">
            Bar tape uses a time-based threshold (12 months from install date).
            No mileage thresholds needed.
          </Text>
        ) : (
          <Group grow>
            <NumberInput
              label="Warning at (miles)"
              placeholder="80% of replace"
              value={warningMiles}
              onChange={setWarningMiles}
              min={0}
            />
            <NumberInput
              label="Replace at (miles)"
              placeholder="Service interval"
              value={replaceMiles}
              onChange={setReplaceMiles}
              min={0}
            />
          </Group>
        )}

        <TextInput
          label="Notes"
          placeholder="Optional notes"
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
        />

        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" onClick={handleCancel}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            loading={saving}
            disabled={!componentType}
          >
            Add Component
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
