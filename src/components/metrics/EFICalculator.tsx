/**
 * EFI Calculator — Interactive educational component
 */
import { useState } from 'react';
import { Stack, Slider, Text, Accordion } from '@mantine/core';
import { computeEFI } from '../../lib/metrics/efi';
import { efiCoachInsight } from '../../lib/metrics/efi';
import { MetricScoreBadge } from './MetricScoreBadge';
import { MetricBarRow } from './MetricBarRow';

export function EFICalculator() {
  const [plannedTSS, setPlannedTSS] = useState(100);
  const [actualTSS, setActualTSS] = useState(95);
  const [plannedZ2, setPlannedZ2] = useState(30);
  const [actualZ2, setActualZ2] = useState(50);
  const [plannedZ5, setPlannedZ5] = useState(20);
  const [actualZ5, setActualZ5] = useState(10);
  const [sessionsCompleted, setSessionsCompleted] = useState(4);
  const [sessionsPlanned, setSessionsPlanned] = useState(5);

  // Build zone distributions (remaining goes to Z1/Z3/Z4)
  const remainingPlanned = Math.max(0, 100 - plannedZ2 - plannedZ5);
  const remainingActual = Math.max(0, 100 - actualZ2 - actualZ5);

  const plannedZones = {
    Z1: remainingPlanned * 0.5 / 100,
    Z2: plannedZ2 / 100,
    Z3: remainingPlanned * 0.2 / 100,
    Z4: remainingPlanned * 0.3 / 100,
    Z5: plannedZ5 / 100,
  };
  const actualZones = {
    Z1: remainingActual * 0.5 / 100,
    Z2: actualZ2 / 100,
    Z3: remainingActual * 0.2 / 100,
    Z4: remainingActual * 0.3 / 100,
    Z5: actualZ5 / 100,
  };

  // Build rolling sessions
  const rollingPlanned = Array(sessionsPlanned).fill(plannedTSS);
  const rollingActual = [
    ...Array(sessionsCompleted).fill(actualTSS),
    ...Array(Math.max(0, sessionsPlanned - sessionsCompleted)).fill(0),
  ];

  const result = computeEFI({
    plannedTSS, actualTSS,
    plannedZones, actualZones,
    rollingSessionsPlanned: rollingPlanned,
    rollingSessionsActual: rollingActual,
  });

  const insight = efiCoachInsight(result);

  return (
    <Stack gap="md">
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <MetricScoreBadge label="EFI" score={result.efi} size="lg" />
        <div style={{ flex: 1 }}>
          <MetricBarRow label="Volume Fidelity" value={result.vf} displayValue={`${(result.vf * 100).toFixed(0)}%`} color="#2A8C82" />
          <MetricBarRow label="Intensity Fidelity" value={result.ifs} displayValue={`${(result.ifs * 100).toFixed(0)}%`} color="#C49A0A" />
          <MetricBarRow label="Consistency" value={result.cf} displayValue={`${(result.cf * 100).toFixed(0)}%`} color="#D4600A" />
        </div>
      </div>

      <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>{insight}</Text>

      <SliderRow label="Planned TSS" value={plannedTSS} onChange={setPlannedTSS} min={20} max={300} />
      <SliderRow label="Actual TSS" value={actualTSS} onChange={setActualTSS} min={0} max={400} />
      <SliderRow label="Planned Z2 %" value={plannedZ2} onChange={setPlannedZ2} min={0} max={80} />
      <SliderRow label="Actual Z2 %" value={actualZ2} onChange={setActualZ2} min={0} max={100} />
      <SliderRow label="Planned Z5 %" value={plannedZ5} onChange={setPlannedZ5} min={0} max={50} />
      <SliderRow label="Actual Z5 %" value={actualZ5} onChange={setActualZ5} min={0} max={50} />
      <SliderRow label="Sessions planned (28d)" value={sessionsPlanned} onChange={setSessionsPlanned} min={1} max={20} />
      <SliderRow label="Sessions completed" value={sessionsCompleted} onChange={setSessionsCompleted} min={0} max={sessionsPlanned} />

      <Accordion>
        <Accordion.Item value="formula">
          <Accordion.Control>
            <Text size="sm" fw={600} style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              How is EFI calculated?
            </Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="xs" c="dimmed" style={{ fontFamily: "'DM Mono', monospace", lineHeight: 1.8 }}>
              EFI = (0.30 × VF + 0.40 × IFS + 0.30 × CF) × 100{'\n\n'}
              VF: Volume Fidelity — TSS ratio with 0.85–1.10 sweet spot{'\n'}
              IFS: Intensity Fidelity — Zone distribution match (Z2 weighted highest){'\n'}
              CF: Consistency Fidelity — 28-day session completion with partial credit
            </Text>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}

function SliderRow({ label, value, onChange, min, max }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text size="xs" c="dimmed">{label}</Text>
        <Text size="xs" fw={600} style={{ fontFamily: "'DM Mono', monospace" }}>{value}</Text>
      </div>
      <Slider value={value} onChange={onChange} min={min} max={max} size="xs" />
    </div>
  );
}
