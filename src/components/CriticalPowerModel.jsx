import { useMemo, useState } from 'react';
import { Box, Group, SegmentedControl, Text, Tooltip } from '@mantine/core';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { BatteryMedium } from '@phosphor-icons/react';
import { StatRow, SubHeading, mono, tooltipStyle, useChartColors } from './train/progressUi.jsx';

/**
 * Critical Power Model Component
 *
 * Implements the Critical Power (CP) / W' (W Prime) model for cycling:
 * - CP: Maximum power sustainable "indefinitely" (typically ~96% of FTP)
 * - W': Anaerobic work capacity (kJ) above CP
 *
 * Power-duration relationship: P = CP + W'/t
 * Where t is duration in seconds
 *
 * W' Balance during a ride shows how much anaerobic capacity remains.
 */

/**
 * Estimate Critical Power and W' from best power efforts
 * Uses Morton's 3-parameter model or simpler 2-parameter model
 */
export function estimateCPandWPrime(bestEfforts, ftp) {
  // Best efforts should be an object like: { 180: 350, 300: 320, 720: 280, 1200: 260 }
  // Key is duration in seconds, value is power in watts

  if (!bestEfforts || Object.keys(bestEfforts).length < 2) {
    // Fallback: estimate from FTP
    // CP is typically 93-97% of FTP
    // W' is typically 15-25 kJ for most cyclists
    if (ftp) {
      return {
        cp: Math.round(ftp * 0.95),
        wPrime: 20000, // 20 kJ default
        model: 'estimated',
      };
    }
    return null;
  }

  // Linear regression using work-duration model
  // Total work = CP * t + W'
  // W(t) = CP * t + W' (work in joules)
  // So: W/t = CP + W'/t
  // P(t) = CP + W'/t

  const durations = Object.keys(bestEfforts).map(Number).sort((a, b) => a - b);
  const powers = durations.map(t => bestEfforts[t]);

  // Use 2-parameter model: P = CP + W'/t
  // Rearrange: P*t = CP*t + W'
  // Linear regression: Work = CP * t + W'

  const n = durations.length;
  let sumT = 0, sumW = 0, sumT2 = 0, sumTW = 0;

  for (let i = 0; i < n; i++) {
    const t = durations[i];
    const w = powers[i] * t; // Work done
    sumT += t;
    sumW += w;
    sumT2 += t * t;
    sumTW += t * w;
  }

  // Solve: CP = (n * sumTW - sumT * sumW) / (n * sumT2 - sumT * sumT)
  const denom = n * sumT2 - sumT * sumT;
  if (denom === 0) return null;

  const cp = (n * sumTW - sumT * sumW) / denom;
  const wPrime = (sumW - cp * sumT) / n;

  // Validate results
  if (cp < 50 || cp > 500 || wPrime < 5000 || wPrime > 50000) {
    // Results out of reasonable range, use FTP estimate
    if (ftp) {
      return {
        cp: Math.round(ftp * 0.95),
        wPrime: 20000,
        model: 'estimated',
      };
    }
    return null;
  }

  return {
    cp: Math.round(cp),
    wPrime: Math.round(wPrime),
    model: 'calculated',
  };
}

/**
 * Calculate W' Balance over time during a ride
 * Uses the differential equation model by Skiba et al.
 *
 * W'bal = W' - integral(P - CP) when P > CP
 * Recovery when P < CP follows exponential recovery
 */
export function calculateWPrimeBalance(powerData, cp, wPrime) {
  if (!powerData || powerData.length === 0 || !cp || !wPrime) {
    return [];
  }

  const tau = 546 * Math.exp(-0.01 * (cp - 200)) + 316; // Recovery time constant
  let wBal = wPrime;
  const result = [];

  for (let i = 0; i < powerData.length; i++) {
    const power = powerData[i];

    if (power > cp) {
      // Depleting W'
      wBal -= (power - cp); // 1 second of work above CP
    } else {
      // Recovering W'
      const dcp = cp - power; // How far below CP
      const recovery = (wPrime - wBal) * (1 - Math.exp(-dcp / tau));
      wBal = Math.min(wPrime, wBal + recovery);
    }

    result.push({
      time: i,
      power,
      wBalance: Math.max(0, wBal),
      wBalancePercent: Math.max(0, (wBal / wPrime) * 100),
      aboveCP: power > cp,
    });
  }

  return result;
}

/**
 * Predict maximum sustainable power for a given duration
 */
export function predictPowerForDuration(cp, wPrime, durationSeconds) {
  if (!cp || !wPrime || durationSeconds <= 0) return null;
  return Math.round(cp + wPrime / durationSeconds);
}

/**
 * Predict maximum duration at a given power
 */
export function predictDurationForPower(cp, wPrime, power) {
  if (!cp || !wPrime || power <= cp) return Infinity; // Sustainable indefinitely
  return Math.round(wPrime / (power - cp));
}

/**
 * Critical Power Model Display Component
 */
const CriticalPowerModel = ({ activities, ftp, weight }) => {
  const [viewMode, setViewMode] = useState('overview'); // 'overview' or 'predictions'
  const CHART = useChartColors();

  // Extract best efforts from activities
  const cpModel = useMemo(() => {
    if (!activities || activities.length === 0) return null;

    const bestEfforts = {};
    const standardDurations = [180, 300, 480, 600, 720, 1200, 1800, 3600];

    // Find activities with power data
    const powerActivities = activities.filter(a => a.average_watts > 0);

    if (powerActivities.length === 0) return null;

    // Estimate best efforts from each activity
    // Note: This is simplified - with power stream data we'd extract actual bests
    powerActivities.forEach(activity => {
      const avgPower = activity.average_watts;
      const maxPower = activity.max_watts || avgPower * 1.5;
      const duration = activity.moving_time || 0;

      standardDurations.forEach(d => {
        if (duration >= d) {
          // Estimate power at this duration using decay model
          const factor = Math.pow(d / Math.max(duration, 1), 0.07);
          const estimatedPower = avgPower + (maxPower - avgPower) * Math.max(0, 1 - factor);

          if (!bestEfforts[d] || estimatedPower > bestEfforts[d]) {
            bestEfforts[d] = Math.round(estimatedPower);
          }
        }
      });
    });

    return estimateCPandWPrime(bestEfforts, ftp);
  }, [activities, ftp]);

  // Generate power-duration curve data
  const powerDurationData = useMemo(() => {
    if (!cpModel) return [];

    const durations = [30, 60, 120, 180, 300, 480, 600, 900, 1200, 1800, 2400, 3600, 5400, 7200];
    return durations.map(d => {
      const predictedPower = predictPowerForDuration(cpModel.cp, cpModel.wPrime, d);
      const predictedWkg = weight ? (predictedPower / weight).toFixed(2) : null;

      let label;
      if (d < 60) label = `${d}s`;
      else if (d < 3600) label = `${Math.round(d / 60)}m`;
      else label = `${(d / 3600).toFixed(1)}h`;

      return {
        duration: d,
        label,
        power: predictedPower,
        wkg: predictedWkg,
        percentCP: Math.round((predictedPower / cpModel.cp) * 100),
      };
    });
  }, [cpModel, weight]);

  // Key predictions
  const predictions = useMemo(() => {
    if (!cpModel) return null;

    const results = [
      { duration: 60, label: '1 minute', power: predictPowerForDuration(cpModel.cp, cpModel.wPrime, 60) },
      { duration: 180, label: '3 minutes', power: predictPowerForDuration(cpModel.cp, cpModel.wPrime, 180) },
      { duration: 300, label: '5 minutes', power: predictPowerForDuration(cpModel.cp, cpModel.wPrime, 300) },
      { duration: 600, label: '10 minutes', power: predictPowerForDuration(cpModel.cp, cpModel.wPrime, 600) },
      { duration: 1200, label: '20 minutes', power: predictPowerForDuration(cpModel.cp, cpModel.wPrime, 1200) },
      { duration: 3600, label: '60 minutes', power: predictPowerForDuration(cpModel.cp, cpModel.wPrime, 3600) },
    ];

    return results.map(r => ({
      ...r,
      wkg: weight ? (r.power / weight).toFixed(2) : null,
      percentCP: Math.round((r.power / cpModel.cp) * 100),
    }));
  }, [cpModel, weight]);

  // Custom tooltip: flat, ruled, numbers in Courier
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0].payload;
    const row = (label, value) => (
      <Group justify="space-between" gap="md" wrap="nowrap">
        <Text size="xs" c="var(--color-text-secondary)">{label}</Text>
        <Text size="xs" fw={700} style={mono}>{value}</Text>
      </Group>
    );
    return (
      <Box style={tooltipStyle} p={8}>
        <Text size="xs" fw={700} mb={4}>{data.label}</Text>
        {row('Power', `${data.power}W`)}
        {data.wkg && row('W/kg', data.wkg)}
        {row('% CP', `${data.percentCP}%`)}
      </Box>
    );
  };

  if (!cpModel) {
    return (
      <Box>
        <SubHeading>Critical power</SubHeading>
        <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
          Not enough power data to calculate a critical power model. Connect a power meter to see your CP and
          W&prime; values.
        </Text>
      </Box>
    );
  }

  const axisTick = { fontSize: 11, fill: CHART.axis, fontFamily: 'var(--font-mono)' };

  return (
    <Box>
      <SubHeading
        aside={
          <SegmentedControl
            size="xs"
            radius={0}
            value={viewMode}
            onChange={setViewMode}
            data={[
              { label: 'Overview', value: 'overview' },
              { label: 'Predictions', value: 'predictions' },
            ]}
          />
        }
      >
        Critical power
        {cpModel.model === 'estimated' && (
          <Tooltip label="Estimated from FTP - actual values may differ">
            <Text component="span" style={{ ...mono, fontSize: 11, fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 8, textTransform: 'none' }}>
              estimated
            </Text>
          </Tooltip>
        )}
      </SubHeading>

      {/* The gloss leads: what this model is, before any number uses its terms. */}
      <Text size="xs" c="var(--color-text-secondary)" mb="sm">
        Critical Power (CP) is the hardest pace you can hold for a long effort. Above
        it you drain a small &quot;sprint battery&quot; (W&prime;) that recharges when you ease off.
      </Text>

      <StatRow
        minWidth={130}
        stats={[
          { label: 'Critical power', value: `${cpModel.cp}W`, note: weight ? `${(cpModel.cp / weight).toFixed(2)} W/kg` : undefined },
          { label: 'Sprint battery (W′)', value: `${(cpModel.wPrime / 1000).toFixed(1)} kJ`, note: 'energy above CP' },
          {
            label: 'Empty at 120% CP',
            value: `${Math.round(predictDurationForPower(cpModel.cp, cpModel.wPrime, cpModel.cp * 1.2) / 60)}m`,
            note: `${Math.round(cpModel.cp * 1.2)}W effort`,
          },
          { label: 'CP vs FTP', value: `${ftp ? Math.round((cpModel.cp / ftp) * 100) : '--'}%`, note: 'typically 93–97%' },
        ]}
      />

      {viewMode === 'overview' ? (
        <>
          <Box mt="md">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={powerDurationData} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} stroke={CHART.baseline} />
                <YAxis
                  tick={axisTick}
                  stroke={CHART.baseline}
                  width={44}
                  domain={['auto', 'auto']}
                  label={{ value: 'Watts', angle: -90, position: 'insideLeft', style: { fill: CHART.axis, fontSize: 11 } }}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <ReferenceLine
                  y={cpModel.cp}
                  stroke={CHART.fitness}
                  strokeDasharray="5 5"
                  label={{ value: `CP ${cpModel.cp}W`, position: 'right', fill: CHART.fitness, fontSize: 11 }}
                />
                <Line type="monotone" dataKey="power" stroke={CHART.fatigue} strokeWidth={2} dot={{ fill: CHART.fatigue, r: 2.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </Box>

          <Text size="xs" mt="sm" c="var(--color-text-secondary)">
            <strong>Critical Power (CP)</strong> is the highest power you can sustain for extended periods.
            <strong> W&prime; (W Prime)</strong> is your anaerobic work capacity above CP — a &quot;battery&quot; of{' '}
            {(cpModel.wPrime / 1000).toFixed(1)} kJ that depletes during hard efforts and recharges during recovery.
          </Text>
        </>
      ) : (
        /* Predictions */
        <Box mt="md" style={{ borderTop: '1px solid var(--color-border)' }}>
          {predictions?.map((p) => (
            <Group key={p.duration} justify="space-between" wrap="nowrap" style={{ borderBottom: '1px solid var(--color-border)', padding: '8px 0' }}>
              <Box>
                <Text size="sm" fw={700}>{p.label}</Text>
                <Text size="xs" c="var(--color-text-muted)">Maximum sustainable power</Text>
              </Box>
              <Group gap="md" wrap="nowrap">
                <Box ta="right">
                  <Text style={{ ...mono, fontSize: 18, fontWeight: 700 }}>{p.power}W</Text>
                  {p.wkg && <Text style={{ ...mono, fontSize: 11, color: 'var(--color-text-muted)' }}>{p.wkg} W/kg</Text>}
                </Box>
                <Box ta="right" w={64}>
                  <Box style={{ height: 6, backgroundColor: 'var(--color-bg-secondary)' }}>
                    <Box style={{ height: 6, width: `${Math.max(0, Math.min(100, p.percentCP - 80))}%`, backgroundColor: 'var(--color-signal)' }} />
                  </Box>
                  <Text style={{ ...mono, fontSize: 11, color: 'var(--color-text-muted)' }}>{p.percentCP}% CP</Text>
                </Box>
              </Group>
            </Group>
          ))}
          <Text size="xs" c="var(--color-text-muted)" mt="sm">
            Predictions from your critical-power model.
          </Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * W' Balance Indicator - shows current W' status during/after a ride
 */
export function WPrimeBalanceGauge({ wBalancePercent, wPrimeKJ }) {
  // Plenty left in ink, running low in signal (no hues outside the roles).
  const fill = wBalancePercent > 50 ? 'var(--color-ink)' : wBalancePercent > 25 ? 'var(--color-easy)' : 'var(--color-signal)';

  return (
    <Tooltip label={`Sprint battery: ${wBalancePercent.toFixed(0)}% of ${wPrimeKJ.toFixed(1)} kJ remaining`}>
      <Box p="xs" style={{ border: '1px solid var(--color-border)' }}>
        <Group gap="xs" mb={4}>
          <BatteryMedium size={14} />
          <Text size="xs">Battery remaining</Text>
        </Group>
        <Box style={{ height: 10, backgroundColor: 'var(--color-bg-secondary)' }}>
          <Box style={{ height: 10, width: `${Math.max(0, Math.min(100, wBalancePercent))}%`, backgroundColor: fill }} />
        </Box>
        <Text size="sm" fw={700} ta="center" mt={4} style={mono}>
          {wBalancePercent.toFixed(0)}%
        </Text>
      </Box>
    </Tooltip>
  );
}

export default CriticalPowerModel;
