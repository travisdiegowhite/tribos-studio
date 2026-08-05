/**
 * Single-select metric chips (Power / HR / Speed) for the activity chart —
 * one primary metric at a time, matching the flagship design.
 */

import { Chip, Group } from '@mantine/core';
import type { MetricKey } from '../model/streamTypes';

export interface MetricOption {
  key: MetricKey;
  label: string;
  chipColor: string;
}

export const METRIC_OPTIONS: MetricOption[] = [
  { key: 'power', label: 'Power', chipColor: 'teal' },
  { key: 'hr', label: 'HR', chipColor: 'coral' },
  { key: 'speed_mps', label: 'Speed', chipColor: 'orange' },
];

interface MetricChipsProps {
  available: MetricKey[];
  active: MetricKey;
  onChange: (metric: MetricKey) => void;
}

export function MetricChips({ available, active, onChange }: MetricChipsProps) {
  const options = METRIC_OPTIONS.filter((o) => available.includes(o.key));
  if (options.length <= 1) return null;
  return (
    <Group gap="xs" wrap="wrap">
      {options.map((option) => (
        <Chip
          key={option.key}
          checked={active === option.key}
          onChange={() => onChange(option.key)}
          size="xs"
          variant="outline"
          color={option.chipColor}
          styles={{ label: { cursor: 'pointer' } }}
        >
          {option.label}
        </Chip>
      ))}
    </Group>
  );
}
