/**
 * TCAS Calculator — Interactive educational component
 */
import { useState } from 'react';
import { Stack, Slider, Text, Accordion } from '@mantine/core';
import { computeTCAS, tcasCoachInsight } from '../../lib/metrics/tcas';
import { MetricScoreBadge } from './MetricScoreBadge';
import { MetricBarRow } from './MetricBarRow';

export function TCASCalculator() {
  const [ctlNow, setCtlNow] = useState(55);
  const [ctl6wAgo, setCtl6wAgo] = useState(40);
  const [avgWeeklyHours, setAvgWeeklyHours] = useState(8);
  const [yearsTraining, setYearsTraining] = useState(5);
  const [efNow, setEfNow] = useState(1.55);
  const [ef6wAgo, setEf6wAgo] = useState(1.48);
  const [paHrNow, setPaHrNow] = useState(4.0);
  const [paHr6wAgo, setPaHr6wAgo] = useState(7.0);
  const [p20minNow, setP20minNow] = useState(255);
  const [p20min6wAgo, setP20min6wAgo] = useState(248);

  const result = computeTCAS({
    ctlNow, ctl6wAgo, avgWeeklyHours, yearsTraining,
    efNow, ef6wAgo, paHrNow, paHr6wAgo, p20minNow, p20min6wAgo,
  });

  const insight = tcasCoachInsight(result);

  return (
    <Stack gap="md">
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <MetricScoreBadge label="TCAS" score={result.tcas} size="lg" />
        <div style={{ flex: 1 }}>
          <MetricBarRow label="Hours Efficiency" value={result.he} maxValue={2.0} displayValue={result.he.toFixed(2)} color="#2A8C82" />
          <MetricBarRow label="Adaptation Quality" value={result.aq} maxValue={1.2} displayValue={result.aq.toFixed(2)} color="#C49A0A" />
          <MetricBarRow label="Training Age Adj" value={result.taa - 1} maxValue={1.0} displayValue={`${result.taa.toFixed(2)}×`} color="#D4600A" />
        </div>
      </div>

      <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>{insight}</Text>

      <Text size="xs" fw={600} c="dimmed" style={{ fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '1px' }}>
        Fitness trajectory
      </Text>
      <SliderRow label="CTL now" value={ctlNow} onChange={setCtlNow} min={0} max={120} />
      <SliderRow label="CTL 6 weeks ago" value={ctl6wAgo} onChange={setCtl6wAgo} min={0} max={120} />
      <SliderRow label="Avg weekly hours" value={avgWeeklyHours} onChange={setAvgWeeklyHours} min={2} max={20} />
      <SliderRow label="Years of training" value={yearsTraining} onChange={setYearsTraining} min={0} max={25} />

      <Text size="xs" fw={600} c="dimmed" style={{ fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '1px' }}>
        Adaptation signals
      </Text>
      <SliderRow label="Efficiency Factor now" value={efNow} onChange={setEfNow} min={0.8} max={2.5} step={0.05} />
      <SliderRow label="Efficiency Factor 6w ago" value={ef6wAgo} onChange={setEf6wAgo} min={0.8} max={2.5} step={0.05} />
      <SliderRow label="Aerobic decoupling now (%)" value={paHrNow} onChange={setPaHrNow} min={0} max={20} step={0.5} />
      <SliderRow label="Aerobic decoupling 6w ago (%)" value={paHr6wAgo} onChange={setPaHr6wAgo} min={0} max={20} step={0.5} />
      <SliderRow label="20-min power now (W)" value={p20minNow} onChange={setP20minNow} min={100} max={400} />
      <SliderRow label="20-min power 6w ago (W)" value={p20min6wAgo} onChange={setP20min6wAgo} min={100} max={400} />

      <Accordion>
        <Accordion.Item value="formula">
          <Accordion.Control>
            <Text size="sm" fw={600} style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              How is TCAS calculated?
            </Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="xs" c="dimmed" style={{ fontFamily: "'DM Mono', monospace", lineHeight: 1.8 }}>
              TCAS = clamp((0.55 × HE + 0.45 × AQ) × TAA × 50, 0, 100){'\n\n'}
              HE: Hours Efficiency = FV / (weekly_hours × 0.30){'\n'}
              AQ: Adaptation Quality = 0.40×EFT + 0.30×ADI + 0.30×PPD{'\n'}
              TAA: Training Age Adjustment = 1 + 0.05 × years{'\n\n'}
              EFT: EF trend (2% improvement = 1.0){'\n'}
              ADI: Decoupling improvement (10pp = 1.0){'\n'}
              PPD: Peak power development (10% gain = 1.0)
            </Text>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}

function SliderRow({ label, value, onChange, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text size="xs" c="dimmed">{label}</Text>
        <Text size="xs" fw={600} style={{ fontFamily: "'DM Mono', monospace" }}>{value}</Text>
      </div>
      <Slider value={value} onChange={onChange} min={min} max={max} step={step} size="xs" />
    </div>
  );
}
