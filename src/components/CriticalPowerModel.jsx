import { useMemo, useState } from 'react';
import {
  Card,
  Text,
  Group,
  Badge,
  Stack,
  Box,
  Paper,
  SimpleGrid,
  Tooltip,
  Progress,
  SegmentedControl,
  Alert,
} from '@mantine/core';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
} from 'recharts';
import { IconBolt, IconBattery, IconFlame, IconClock, IconInfoCircle } from '@tabler/icons-react';
import { tokens } from '../theme';

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

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0].payload;

    return (
      <Card withBorder p="xs" style={{ backgroundColor: 'var(--tribos-bg-secondary)' }}>
        <Text size="xs" fw={600} mb="xs">{data.label}</Text>
        <Group gap="md">
          <Box>
            <Text size="xs" c="dimmed">Power</Text>
            <Text size="sm" fw={600}>{data.power}W</Text>
          </Box>
          {data.wkg && (
            <Box>
              <Text size="xs" c="dimmed">W/kg</Text>
              <Text size="sm" fw={600}>{data.wkg}</Text>
            </Box>
          )}
          <Box>
            <Text size="xs" c="dimmed">% CP</Text>
            <Text size="sm" fw={600}>{data.percentCP}%</Text>
          </Box>
        </Group>
      </Card>
    );
  };

  if (!cpModel) {
    return (
      <Card withBorder p="xl">
        <Text style={{ color: 'var(--tribos-text-muted)' }} ta="center">
          Not enough power data to calculate Critical Power model.
          Connect a power meter to see your CP and W' values.
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="sm">
          <IconBattery size={20} color={tokens.colors.zone5} />
          <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
            Critical Power Model
          </Text>
          {cpModel.model === 'estimated' && (
            <Tooltip label="Estimated from FTP - actual values may differ">
              <Badge color="yellow" variant="light" size="xs">Estimated</Badge>
            </Tooltip>
          )}
        </Group>
        <SegmentedControl
          size="xs"
          value={viewMode}
          onChange={setViewMode}
          data={[
            { label: 'Overview', value: 'overview' },
            { label: 'Predictions', value: 'predictions' },
          ]}
        />
      </Group>

      {/* Key Metrics */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="md">
        <Paper p="sm" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
          <Group gap="xs" mb={2}>
            <IconBolt size={14} color={tokens.colors.zone4} />
            <Text size="xs" c="dimmed">Critical Power</Text>
          </Group>
          <Text size="lg" fw={700} c="orange">{cpModel.cp}W</Text>
          {weight && <Text size="xs" c="dimmed">{(cpModel.cp / weight).toFixed(2)} W/kg</Text>}
        </Paper>

        <Paper p="sm" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
          <Group gap="xs" mb={2}>
            <IconBattery size={14} color={tokens.colors.zone5} />
            <Text size="xs" c="dimmed">W' (W Prime)</Text>
          </Group>
          <Text size="lg" fw={700} c="red">{(cpModel.wPrime / 1000).toFixed(1)} kJ</Text>
          <Text size="xs" c="dimmed">Anaerobic capacity</Text>
        </Paper>

        <Paper p="sm" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
          <Group gap="xs" mb={2}>
            <IconClock size={14} color={tokens.colors.zone2} />
            <Text size="xs" c="dimmed">TTE at 120% CP</Text>
          </Group>
          <Text size="lg" fw={700} c="blue">
            {Math.round(predictDurationForPower(cpModel.cp, cpModel.wPrime, cpModel.cp * 1.2) / 60)}m
          </Text>
          <Text size="xs" c="dimmed">{Math.round(cpModel.cp * 1.2)}W effort</Text>
        </Paper>

        <Paper p="sm" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
          <Group gap="xs" mb={2}>
            <IconFlame size={14} color={tokens.colors.zone3} />
            <Text size="xs" c="dimmed">CP vs FTP</Text>
          </Group>
          <Text size="lg" fw={700} c="yellow">
            {ftp ? Math.round((cpModel.cp / ftp) * 100) : '--'}%
          </Text>
          <Text size="xs" c="dimmed">CP is typically 93-97%</Text>
        </Paper>
      </SimpleGrid>

      {viewMode === 'overview' ? (
        <>
          {/* Power-Duration Curve */}
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={powerDurationData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={'var(--tribos-bg-tertiary)'} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--tribos-text-muted)' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--tribos-text-muted)' }}
                domain={['auto', 'auto']}
                label={{
                  value: 'Watts',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fill: 'var(--tribos-text-muted)', fontSize: 11 }
                }}
              />
              <RechartsTooltip content={<CustomTooltip />} />

              {/* CP Reference Line */}
              <ReferenceLine
                y={cpModel.cp}
                stroke={tokens.colors.zone4}
                strokeDasharray="5 5"
                label={{
                  value: `CP: ${cpModel.cp}W`,
                  position: 'right',
                  fill: tokens.colors.zone4,
                  fontSize: 10
                }}
              />

              <Line
                type="monotone"
                dataKey="power"
                stroke="#C4785C"
                strokeWidth={2}
                dot={{ fill: '#C4785C', r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Model Explanation */}
          <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />} mt="md">
            <Text size="xs">
              <strong>Critical Power (CP)</strong> is the highest power you can sustain for extended periods.
              <strong> W' (W Prime)</strong> is your anaerobic work capacity above CP - like a "battery" of {(cpModel.wPrime / 1000).toFixed(1)} kJ
              that depletes during hard efforts and recharges during recovery.
            </Text>
          </Alert>
        </>
      ) : (
        /* Predictions View */
        <Stack gap="sm">
          {predictions?.map((p) => (
            <Paper key={p.duration} p="sm" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
              <Group justify="space-between">
                <Box>
                  <Text size="sm" fw={600}>{p.label}</Text>
                  <Text size="xs" c="dimmed">Maximum sustainable power</Text>
                </Box>
                <Group gap="md">
                  <Box ta="right">
                    <Text size="lg" fw={700} c="orange">{p.power}W</Text>
                    {p.wkg && <Text size="xs" c="dimmed">{p.wkg} W/kg</Text>}
                  </Box>
                  <Box ta="right" w={60}>
                    <Progress value={Math.min(100, p.percentCP - 80)} color="orange" size="sm" />
                    <Text size="xs" c="dimmed">{p.percentCP}% CP</Text>
                  </Box>
                </Group>
              </Group>
            </Paper>
          ))}

          <Text size="xs" c="dimmed" ta="center" mt="sm">
            Predictions based on P = CP + W'/t power-duration model
          </Text>
        </Stack>
      )}
    </Card>
  );
};

/**
 * W' Balance Indicator - shows current W' status during/after a ride
 */
export function WPrimeBalanceGauge({ wBalancePercent, wPrimeKJ }) {
  const getColor = (pct) => {
    if (pct > 75) return 'green';
    if (pct > 50) return 'lime';
    if (pct > 25) return 'yellow';
    if (pct > 10) return 'orange';
    return 'red';
  };

  return (
    <Tooltip label={`W' Balance: ${wBalancePercent.toFixed(0)}% of ${wPrimeKJ.toFixed(1)} kJ remaining`}>
      <Paper p="xs" style={{ backgroundColor: 'var(--tribos-bg-tertiary)' }}>
        <Group gap="xs" mb={4}>
          <IconBattery size={14} />
          <Text size="xs">W' Balance</Text>
        </Group>
        <Progress
          value={wBalancePercent}
          color={getColor(wBalancePercent)}
          size="lg"
          radius="xl"
          striped={wBalancePercent < 25}
          animated={wBalancePercent < 10}
        />
        <Text size="sm" fw={600} ta="center" mt={4}>
          {wBalancePercent.toFixed(0)}%
        </Text>
      </Paper>
    </Tooltip>
  );
}

export default CriticalPowerModel;
