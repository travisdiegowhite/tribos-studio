import { useMemo } from 'react';
import { Box, Group, Stack, Text } from '@mantine/core';
import { Check, Info, TrendDown, Warning } from '@phosphor-icons/react';
import HandTick from './ui/HandTick.jsx';
import { StatRow, TONE, display, mono } from './train/progressUi.jsx';

/**
 * Ramp Rate Alert Component
 * Monitors weekly TFI (fitness) changes and alerts on concerning ramp rates
 *
 * Optimal ramp rate: 3-7 RSS/week
 * Aggressive ramp rate: 7-10 RSS/week (risk of overtraining)
 * Dangerous ramp rate: >10 RSS/week (high injury/illness risk)
 * Detraining: < -5 RSS/week (losing fitness)
 */
const RampRateAlert = ({ dailyTSSData, currentCTL, showDetails = true }) => {
  const rampRateData = useMemo(() => {
    if (!dailyTSSData || dailyTSSData.length < 14) {
      return null;
    }

    // CTL at a given day index. Points from TrainingDashboard carry a
    // server-preferred per-day ctl (buildDailyLoadSeries); fall back to a
    // client iterative EWA for plain {date, tss} inputs.
    const calculateCTLAtDay = (data, endIndex) => {
      if (endIndex < 0) return 0;
      if (data[endIndex]?.ctl != null) return Math.round(data[endIndex].ctl);
      let ctl = 0;
      for (let i = 0; i <= endIndex; i++) {
        ctl = ctl + (data[i].tss - ctl) / 42;
      }
      return Math.round(ctl);
    };

    // Get CTL from 7 days ago and 14 days ago
    const currentIndex = dailyTSSData.length - 1;
    const oneWeekAgoIndex = currentIndex - 7;
    const twoWeeksAgoIndex = currentIndex - 14;

    const ctlNow = currentCTL || calculateCTLAtDay(dailyTSSData, currentIndex);
    const ctlOneWeekAgo = calculateCTLAtDay(dailyTSSData, oneWeekAgoIndex);
    const ctlTwoWeeksAgo = calculateCTLAtDay(dailyTSSData, twoWeeksAgoIndex);

    // Calculate ramp rates
    const weeklyRampRate = ctlNow - ctlOneWeekAgo;
    const previousWeekRampRate = ctlOneWeekAgo - ctlTwoWeeksAgo;
    const trend = weeklyRampRate - previousWeekRampRate;

    // Calculate 4-week average ramp rate for more stability
    const fourWeeksAgoIndex = currentIndex - 28;
    const ctlFourWeeksAgo = calculateCTLAtDay(dailyTSSData, fourWeeksAgoIndex);
    const monthlyRampRate = (ctlNow - ctlFourWeeksAgo) / 4;

    // Determine status
    let status, color, icon, message, recommendation;

    if (weeklyRampRate > 10) {
      status = 'danger';
      color = 'warn';
      icon = Warning;
      message = `You're ramping load far faster than your body can absorb (+${weeklyRampRate} fitness points/week)`;
      recommendation = 'Significantly reduce training load immediately. High risk of overtraining, injury, or illness.';
    } else if (weeklyRampRate > 7) {
      status = 'warning';
      color = 'warn';
      icon = Warning;
      message = `You're building load aggressively (+${weeklyRampRate} fitness points/week)`;
      recommendation = 'Consider backing off slightly. Monitor fatigue levels closely.';
    } else if (weeklyRampRate >= 3 && weeklyRampRate <= 7) {
      status = 'optimal';
      color = 'done';
      icon = Check;
      message = `You're building load at a sustainable rate (+${weeklyRampRate} fitness points/week)`;
      recommendation = 'Great job! This is the ideal rate for sustainable fitness gains.';
    } else if (weeklyRampRate >= 0 && weeklyRampRate < 3) {
      status = 'maintenance';
      color = 'neutral';
      icon = Info;
      message = `You're holding fitness steady (+${weeklyRampRate} fitness points/week)`;
      recommendation = 'You\'re maintaining fitness. Increase load slightly if looking to improve.';
    } else if (weeklyRampRate >= -5) {
      status = 'recovery';
      color = 'easy';
      icon = TrendDown;
      message = `Load is easing off — recovery or taper (${weeklyRampRate} fitness points/week)`;
      recommendation = 'This could be a recovery week or taper. Normal if intentional.';
    } else {
      status = 'detraining';
      color = 'warn';
      icon = TrendDown;
      message = `Load has dropped enough that fitness is fading (${weeklyRampRate} fitness points/week)`;
      recommendation = 'Significant fitness loss occurring. Resume training if unintentional.';
    }

    return {
      weeklyRampRate,
      previousWeekRampRate,
      monthlyRampRate: Math.round(monthlyRampRate * 10) / 10,
      trend,
      ctlNow,
      ctlOneWeekAgo,
      status,
      color,
      icon,
      message,
      recommendation,
    };
  }, [dailyTSSData, currentCTL]);

  if (!rampRateData) {
    return null;
  }

  // Don't show alert for optimal/maintenance status unless showDetails is true
  if (!showDetails && (rampRateData.status === 'optimal' || rampRateData.status === 'maintenance')) {
    return null;
  }

  const tone = TONE[rampRateData.color] ?? TONE.neutral;
  const rate = `${rampRateData.weeklyRampRate > 0 ? '+' : ''}${rampRateData.weeklyRampRate}`;

  // Gauge: -10 … +15 fitness points/week, with the sustainable band (3–7) shaded.
  const normalizedRamp = Math.min(15, Math.max(-10, rampRateData.weeklyRampRate));
  const markerPct = ((normalizedRamp + 10) / 25) * 100;

  return (
    <Box style={{ borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', padding: '12px 0' }}>
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text style={{ ...display, fontSize: 15 }}>Ramp rate</Text>
          <Text size="xs" c="var(--color-text-muted)">How fast you&apos;re adding training load</Text>
        </Box>
        <Group gap="sm" align="center" wrap="nowrap">
          {rampRateData.status === 'danger' && <span className="tribos-stamp">Too fast</span>}
          {rampRateData.status === 'optimal' && <HandTick size={22} title="Sustainable" />}
          <Text style={{ ...mono, fontSize: 22, fontWeight: 700, color: tone, whiteSpace: 'nowrap' }}>
            {rate}
            <Text component="span" style={{ ...mono, fontSize: 12, fontWeight: 400, color: 'var(--color-text-muted)' }}>
              {' '}pts/wk
            </Text>
          </Text>
        </Group>
      </Group>

      <Text size="sm" mt={8} style={{ color: tone === TONE.warn ? TONE.warn : 'var(--color-text-primary)' }}>
        {rampRateData.message}
      </Text>

      {showDetails && (
        <Stack gap="sm" mt="sm">
          {/* Gauge */}
          <Box>
            <Box style={{ position: 'relative', height: 10, backgroundColor: 'var(--color-bg-secondary)' }}>
              <Box
                style={{
                  position: 'absolute',
                  left: `${((3 + 10) / 25) * 100}%`,
                  width: `${((7 - 3) / 25) * 100}%`,
                  top: 0,
                  bottom: 0,
                  backgroundColor: 'var(--color-easy-subtle)',
                  borderLeft: '1px solid var(--color-easy)',
                  borderRight: '1px solid var(--color-easy)',
                }}
              />
              <Box
                aria-hidden
                style={{
                  position: 'absolute',
                  left: `calc(${markerPct}% - 1.5px)`,
                  top: -3,
                  bottom: -3,
                  width: 3,
                  backgroundColor: tone,
                }}
              />
            </Box>
            <Group justify="space-between" mt={4}>
              <Text style={{ ...mono, fontSize: 10, color: 'var(--color-text-muted)' }}>-10 · losing fitness</Text>
              <Text style={{ ...mono, fontSize: 10, color: 'var(--color-easy)' }}>3–7 sustainable</Text>
              <Text style={{ ...mono, fontSize: 10, color: 'var(--color-text-muted)' }}>too fast · +15</Text>
            </Group>
          </Box>

          <StatRow
            minWidth={120}
            stats={[
              {
                label: '4-week avg',
                value: `${rampRateData.monthlyRampRate > 0 ? '+' : ''}${rampRateData.monthlyRampRate}/wk`,
              },
              {
                label: 'Trend',
                value: `${rampRateData.trend > 0 ? '+' : ''}${rampRateData.trend}`,
                note: rampRateData.trend > 0 ? 'speeding up' : rampRateData.trend < 0 ? 'slowing down' : 'steady',
              },
              { label: 'Fitness (TFI)', value: String(rampRateData.ctlNow) },
            ]}
          />

          <Text size="sm" c="var(--color-text-secondary)">
            {rampRateData.recommendation}
          </Text>
        </Stack>
      )}
    </Box>
  );
};

export default RampRateAlert;
