import { useState, useEffect } from 'react';
import {
  Paper,
  TextInput,
  NumberInput,
  Stack,
  Group,
  Button,
  Select,
  Switch,
  Text,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { COMPONENT_TYPES, TIRE_COMPONENT_TYPES, WHEEL_COMPONENT_TYPES, METERS_PER_MILE } from './gearConstants';

// Default thresholds in miles for display (matching api/utils/gearDefaults.js)
const DEFAULT_THRESHOLDS_MILES = {
  chain: { warning: 1200, replace: 1500 },
  cassette: { warning: 2400, replace: 3000 },
  tires_road: { warning: 2000, replace: 2500 },
  tires_gravel: { warning: 1200, replace: 1500 },
  wheels_road: { warning: null, replace: null },
  wheels_gravel: { warning: null, replace: null },
  brake_pads_rim: { warning: 1200, replace: 1500 },
  brake_pads_disc: { warning: 1600, replace: 2000 },
  bar_tape: { warning: null, replace: null },
  cables: { warning: 2400, replace: 3000 },
};

const TIRE_WIDTH_OPTIONS = [
  { value: '23', label: '23c' },
  { value: '25', label: '25c' },
  { value: '28', label: '28c' },
  { value: '30', label: '30c' },
  { value: '32', label: '32c' },
  { value: '35', label: '35c' },
  { value: '38', label: '38c' },
  { value: '40', label: '40c' },
  { value: '45', label: '45c' },
  { value: '50', label: '50c' },
];

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

  // Tire metadata
  const [tireWidthMm, setTireWidthMm] = useState('28');
  const [tubeless, setTubeless] = useState(false);
  const [maxPressurePsi, setMaxPressurePsi] = useState(null);

  // Wheel metadata
  const [rimWidthMm, setRimWidthMm] = useState(21);
  const [hookless, setHookless] = useState(false);

  // Auto-populate thresholds and metadata defaults when component type changes
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
      // Set sensible tire defaults based on type
      if (componentType === 'tires_road') {
        setTireWidthMm('28');
        setTubeless(false);
        setMaxPressurePsi(100);
      } else if (componentType === 'tires_gravel') {
        setTireWidthMm('40');
        setTubeless(true);
        setMaxPressurePsi(60);
      }
      // Set sensible wheel defaults based on type
      if (componentType === 'wheels_road') {
        setRimWidthMm(21);
        setHookless(false);
      } else if (componentType === 'wheels_gravel') {
        setRimWidthMm(25);
        setHookless(false);
      }
    }
  }, [componentType]);

  const isTire = TIRE_COMPONENT_TYPES.includes(componentType);
  const isWheel = WHEEL_COMPONENT_TYPES.includes(componentType);

  const reset = () => {
    setComponentType('');
    setBrand('');
    setModel('');
    setInstalledDate(new Date());
    setWarningMiles(null);
    setReplaceMiles(null);
    setNotes('');
    setTireWidthMm('28');
    setTubeless(false);
    setMaxPressurePsi(null);
    setRimWidthMm(21);
    setHookless(false);
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const handleSubmit = async () => {
    if (!componentType || !gearItemId) return;
    setSaving(true);
    try {
      // Build metadata for tire/wheel components
      let componentMetadata;
      if (isTire) {
        componentMetadata = {
          width_mm: parseInt(tireWidthMm),
          tubeless,
          ...(maxPressurePsi ? { max_pressure_psi: maxPressurePsi } : {}),
        };
      } else if (isWheel) {
        componentMetadata = {
          rim_width_mm: rimWidthMm,
          hookless,
        };
      }

      await onSave({
        gearItemId,
        componentType,
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        installedDate: installedDate
          ? (installedDate instanceof Date ? installedDate.toISOString().split('T')[0] : String(installedDate))
          : undefined,
        // Convert miles to meters for the API
        warningThreshold: warningMiles ? warningMiles * METERS_PER_MILE : undefined,
        replaceThreshold: replaceMiles ? replaceMiles * METERS_PER_MILE : undefined,
        notes: notes.trim() || undefined,
        ...(componentMetadata ? { metadata: componentMetadata } : {}),
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
          onChange={(v) => setInstalledDate(v instanceof Date ? v : v ? new Date(v) : null)}
          popoverProps={{ withinPortal: false }}
        />

        {/* Tire-specific metadata fields */}
        {isTire && (
          <>
            <Group grow>
              <Select
                label="Tire Width"
                data={TIRE_WIDTH_OPTIONS}
                value={tireWidthMm}
                onChange={(v) => setTireWidthMm(v || '28')}
                comboboxProps={{ withinPortal: false }}
              />
              <NumberInput
                label="Max Pressure (PSI)"
                placeholder="Optional"
                value={maxPressurePsi}
                onChange={setMaxPressurePsi}
                min={20}
                max={160}
              />
            </Group>
            <Switch
              label="Tubeless"
              description="Tubeless tires allow ~8% lower pressure"
              checked={tubeless}
              onChange={(e) => setTubeless(e.currentTarget.checked)}
            />
          </>
        )}

        {/* Wheel-specific metadata fields */}
        {isWheel && (
          <>
            <NumberInput
              label="Internal Rim Width (mm)"
              description="Affects optimal tire pressure range"
              value={rimWidthMm}
              onChange={(v) => setRimWidthMm(v || 21)}
              min={13}
              max={50}
            />
            <Switch
              label="Hookless"
              description="Hookless rims have lower max pressure limits"
              checked={hookless}
              onChange={(e) => setHookless(e.currentTarget.checked)}
            />
          </>
        )}

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
