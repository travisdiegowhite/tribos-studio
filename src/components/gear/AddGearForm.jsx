import { useState } from 'react';
import {
  Paper,
  TextInput,
  NumberInput,
  Stack,
  Group,
  Button,
  SegmentedControl,
  Switch,
  Collapse,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';

/**
 * Inline collapsible form for adding a new gear item (bike or shoes).
 * Replaces the previous AddGearModal to avoid modal stacking issues.
 */
export default function AddGearForm({ opened, onCancel, onSave }) {
  const [sportType, setSportType] = useState('cycling');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(null);
  const [purchasePrice, setPurchasePrice] = useState(null);
  const [notes, setNotes] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [stravaGearId, setStravaGearId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setSportType('cycling');
    setName('');
    setBrand('');
    setModel('');
    setPurchaseDate(null);
    setPurchasePrice(null);
    setNotes('');
    setIsDefault(false);
    setStravaGearId('');
    setShowAdvanced(false);
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        sportType,
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        purchaseDate: purchaseDate ? purchaseDate.toISOString().split('T')[0] : undefined,
        purchasePrice: purchasePrice || undefined,
        notes: notes.trim() || undefined,
        isDefault,
        stravaGearId: stravaGearId.trim() || undefined,
      });
      reset();
    } catch {
      // Error handling done by caller
    } finally {
      setSaving(false);
    }
  };

  return (
    <Collapse in={opened}>
      <Paper withBorder p="lg" radius="md">
        <Stack gap="md">
          <Title order={4}>Add Gear</Title>

          <SegmentedControl
            fullWidth
            value={sportType}
            onChange={setSportType}
            data={[
              { label: 'Cycling (Bike)', value: 'cycling' },
              { label: 'Running (Shoes)', value: 'running' },
            ]}
          />

          <TextInput
            label="Name"
            placeholder={sportType === 'cycling' ? 'e.g. Trek Domane' : 'e.g. Nike Pegasus 41'}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
          />

          <Group grow>
            <TextInput
              label="Brand"
              placeholder="e.g. Trek, Nike"
              value={brand}
              onChange={(e) => setBrand(e.currentTarget.value)}
            />
            <TextInput
              label="Model"
              placeholder="e.g. Domane SL 6"
              value={model}
              onChange={(e) => setModel(e.currentTarget.value)}
            />
          </Group>

          <Group grow>
            <DateInput
              label="Purchase Date"
              placeholder="Optional"
              value={purchaseDate}
              onChange={setPurchaseDate}
              clearable
            />
            <NumberInput
              label="Purchase Price"
              placeholder="Optional"
              prefix="$"
              value={purchasePrice}
              onChange={setPurchasePrice}
              min={0}
              decimalScale={2}
            />
          </Group>

          <Switch
            label="Set as default for new activities"
            description={sportType === 'cycling'
              ? 'New cycling activities will auto-assign this bike'
              : 'New running activities will auto-assign these shoes'}
            checked={isDefault}
            onChange={(e) => setIsDefault(e.currentTarget.checked)}
          />

          <UnstyledButton onClick={() => setShowAdvanced(!showAdvanced)}>
            <Group gap={4}>
              {showAdvanced ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              <Text size="sm" c="dimmed">Advanced</Text>
            </Group>
          </UnstyledButton>

          <Collapse in={showAdvanced}>
            <Stack gap="sm">
              <TextInput
                label="Strava Gear ID"
                placeholder="e.g. b12345678"
                description="Found in your Strava gear settings URL. Enables auto-matching on Strava syncs."
                value={stravaGearId}
                onChange={(e) => setStravaGearId(e.currentTarget.value)}
              />
              <TextInput
                label="Notes"
                placeholder="Optional notes"
                value={notes}
                onChange={(e) => setNotes(e.currentTarget.value)}
              />
            </Stack>
          </Collapse>

          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={handleCancel}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              loading={saving}
              disabled={!name.trim()}
            >
              Add {sportType === 'cycling' ? 'Bike' : 'Shoes'}
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Collapse>
  );
}
