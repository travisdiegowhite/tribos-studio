/**
 * TWL Calculator — Interactive educational component
 */
import { useState } from 'react';
import { Stack, Slider, Text, Accordion } from '@mantine/core';
import { computeTWL } from '../../lib/metrics/twl';
import { MetricBarRow } from './MetricBarRow';

export function TWLCalculator() {
  const [baseTSS, setBaseTSS] = useState(100);
  const [elevationGain, setElevationGain] = useState(800);
  const [durationHours, setDurationHours] = useState(2.5);
  const [gvi, setGvi] = useState(3.0);
  const [meanElevation, setMeanElevation] = useState(1600);

  const result = computeTWL({
    baseTSS,
    elevationGainM: elevationGain,
    rideDurationHours: durationHours,
    gvi,
    meanElevationM: meanElevation,
  });

  return (
    <Stack gap="md">
      {/* Score display */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px', border: '0.5px solid var(--color-border)',
        backgroundColor: 'var(--color-card)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <Text style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Base TSS
          </Text>
          <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 700, color: 'var(--color-text-muted)' }}>
            {baseTSS}
          </Text>
        </div>
        <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, color: 'var(--color-text-muted)' }}>→</Text>
        <div style={{ textAlign: 'center' }}>
          <Text style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            TWL
          </Text>
          <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 700, color: '#2A8C82' }}>
            {Math.round(result.twl)}
          </Text>
        </div>
        {result.overagePercent > 0 && (
          <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: 'var(--color-text-muted)' }}>
            +{result.overagePercent}% terrain
          </Text>
        )}
      </div>

      {/* Multiplier breakdown */}
      <div>
        <Text size="xs" fw={600} c="dimmed" mb={8} style={{ fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '1px' }}>
          Terrain multiplier: {result.mTerrain.toFixed(3)}×
        </Text>
        <MetricBarRow label={`Climbing (VAM ${result.vam} m/hr)`} value={result.alphaComponent} maxValue={0.15} displayValue={`+${(result.alphaComponent * 100).toFixed(1)}%`} color="#2A8C82" />
        <MetricBarRow label={`Gradient variability (σ ${gvi.toFixed(1)}%)`} value={result.betaComponent} maxValue={0.36} displayValue={`+${(result.betaComponent * 100).toFixed(1)}%`} color="#C49A0A" />
        <MetricBarRow label={`Altitude (${meanElevation}m avg)`} value={result.gammaComponent} maxValue={0.10} displayValue={`+${(result.gammaComponent * 100).toFixed(1)}%`} color="#D4600A" />
      </div>

      {/* Sliders */}
      <SliderRow label="Base TSS" value={baseTSS} onChange={setBaseTSS} min={20} max={400} />
      <SliderRow label="Elevation gain (m)" value={elevationGain} onChange={setElevationGain} min={0} max={3000} />
      <SliderRow label="Duration (hours)" value={durationHours} onChange={setDurationHours} min={0.5} max={8} step={0.5} />
      <SliderRow label="Gradient variability (σ %)" value={gvi} onChange={setGvi} min={0} max={12} step={0.5} />
      <SliderRow label="Mean elevation (m)" value={meanElevation} onChange={setMeanElevation} min={0} max={4000} step={100} />

      <Accordion>
        <Accordion.Item value="formula">
          <Accordion.Control>
            <Text size="sm" fw={600} style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              How is TWL calculated?
            </Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="xs" c="dimmed" style={{ fontFamily: "'DM Mono', monospace", lineHeight: 1.8 }}>
              TWL = TSS × M_terrain{'\n'}
              M_terrain = 1 + (α × VAM_norm) + (β × GVI) + (γ × ALT){'\n\n'}
              α = 0.10 (climbing rate){'\n'}
              β = 0.03 (gradient variability){'\n'}
              γ = 0.05 (altitude above 1000m){'\n'}
              VAM_norm = VAM / 1000, capped at 1.5
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
