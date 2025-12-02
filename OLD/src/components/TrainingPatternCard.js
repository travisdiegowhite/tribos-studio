import React, { useState, useEffect } from 'react';
import {
  Card,
  Stack,
  Text,
  Group,
  Progress,
  Badge,
  SimpleGrid,
  Alert,
  Tooltip,
  ActionIcon,
  Collapse,
  Loader
} from '@mantine/core';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Info,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../supabase';

export default function TrainingPatternCard({ user }) {
  const [patterns, setPatterns] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (user?.id) {
      loadTrainingPatterns();
    }
  }, [user]);

  const loadTrainingPatterns = async () => {
    setLoading(true);
    try {
      // Get last 4 weeks of rides with classifications
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

      const { data: rides, error } = await supabase
        .from('routes')
        .select('id, recorded_at, training_stress_score')
        .eq('user_id', user.id)
        .gte('recorded_at', fourWeeksAgo.toISOString().split('T')[0])
        .order('recorded_at', { ascending: false });

      // Get ride classifications separately
      const rideIds = rides?.map(r => r.id) || [];
      const { data: classifications } = rideIds.length > 0
        ? await supabase
            .from('ride_classification')
            .select('ride_id, zone')
            .in('ride_id', rideIds)
        : { data: [] };

      // Create a map of ride_id to zone
      const zoneMap = {};
      (classifications || []).forEach(c => {
        zoneMap[c.ride_id] = c.zone;
      });

      if (error) throw error;

      // Calculate patterns
      const zoneCounts = {
        recovery: 0,
        endurance: 0,
        tempo: 0,
        sweet_spot: 0,
        threshold: 0,
        vo2max: 0,
        anaerobic: 0
      };

      const weeklyTSS = [];
      const dailyTSS = {};

      rides.forEach((ride) => {
        const zone = zoneMap[ride.id];
        if (zone && zoneCounts.hasOwnProperty(zone)) {
          zoneCounts[zone]++;
        }

        const date = ride.recorded_at?.split('T')[0]; // Extract date from timestamp
        if (date) {
          dailyTSS[date] = (dailyTSS[date] || 0) + (ride.training_stress_score || 0);
        }
      });

      // Calculate weekly TSS
      const weeks = [];
      for (let i = 0; i < 4; i++) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - (i * 7) - 7);
        const weekEnd = new Date();
        weekEnd.setDate(weekEnd.getDate() - (i * 7));

        const weekTSS = Object.entries(dailyTSS)
          .filter(([date]) => {
            const d = new Date(date);
            return d >= weekStart && d < weekEnd;
          })
          .reduce((sum, [_, tss]) => sum + tss, 0);

        weeks.unshift(weekTSS);
      }

      // Calculate training monotony (standard deviation of daily TSS)
      const tssValues = Object.values(dailyTSS);
      const avgDailyTSS = tssValues.reduce((a, b) => a + b, 0) / tssValues.length || 0;
      const variance = tssValues.reduce((sum, tss) => sum + Math.pow(tss - avgDailyTSS, 2), 0) / tssValues.length;
      const stdDev = Math.sqrt(variance);
      const monotony = avgDailyTSS > 0 ? avgDailyTSS / (stdDev || 1) : 0;

      // Calculate zone distribution percentages
      const totalRides = Object.values(zoneCounts).reduce((a, b) => a + b, 0);
      const zonePercentages = {};
      Object.entries(zoneCounts).forEach(([zone, count]) => {
        zonePercentages[zone] = totalRides > 0 ? (count / totalRides) * 100 : 0;
      });

      // Analyze balance (polarized vs pyramidal)
      const lowIntensity = zonePercentages.recovery + zonePercentages.endurance;
      const mediumIntensity = zonePercentages.tempo + zonePercentages.sweet_spot;
      const highIntensity = zonePercentages.threshold + zonePercentages.vo2max + zonePercentages.anaerobic;

      let trainingBalance = 'balanced';
      if (lowIntensity > 75 && highIntensity > 15) {
        trainingBalance = 'polarized'; // Ideal for most cyclists
      } else if (lowIntensity > 80) {
        trainingBalance = 'base-heavy';
      } else if (mediumIntensity > 40) {
        trainingBalance = 'tempo-focused';
      } else if (highIntensity > 30) {
        trainingBalance = 'high-intensity';
      }

      setPatterns({
        zonePercentages,
        zoneCounts,
        totalRides,
        weeklyTSS: weeks,
        avgWeeklyTSS: weeks.reduce((a, b) => a + b, 0) / 4,
        monotony,
        lowIntensity,
        mediumIntensity,
        highIntensity,
        trainingBalance
      });
    } catch (error) {
      console.error('Error loading training patterns:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Group justify="center" p="md">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">Loading training patterns...</Text>
        </Group>
      </Card>
    );
  }

  if (!patterns || patterns.totalRides === 0) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Group gap="xs">
            <BarChart3 size={20} />
            <Text fw={600}>Training Patterns</Text>
          </Group>
          <Alert icon={<Info size={16} />} color="blue" variant="light">
            Not enough training data yet. Complete more rides to see your training patterns.
          </Alert>
        </Stack>
      </Card>
    );
  }

  const getBalanceInfo = (balance) => {
    const info = {
      polarized: {
        color: 'green',
        icon: <TrendingUp size={14} />,
        label: 'Polarized',
        description: 'Ideal balance: mostly easy, some hard, minimal medium'
      },
      'base-heavy': {
        color: 'blue',
        icon: <Info size={14} />,
        label: 'Base Building',
        description: 'Heavy endurance focus - good for building aerobic base'
      },
      'tempo-focused': {
        color: 'yellow',
        icon: <AlertTriangle size={14} />,
        label: 'Tempo Heavy',
        description: 'Lots of medium intensity - consider more polarization'
      },
      'high-intensity': {
        color: 'orange',
        icon: <AlertTriangle size={14} />,
        label: 'High Intensity',
        description: 'High stress load - ensure adequate recovery'
      },
      balanced: {
        color: 'gray',
        icon: <Info size={14} />,
        label: 'Balanced',
        description: 'Mixed training approach'
      }
    };

    return info[balance] || info.balanced;
  };

  const balanceInfo = getBalanceInfo(patterns.trainingBalance);

  const zoneColors = {
    recovery: '#10b981',
    endurance: '#3b82f6',
    tempo: '#eab308',
    sweet_spot: '#f97316',
    threshold: '#ef4444',
    vo2max: '#a855f7',
    anaerobic: '#7c3aed'
  };

  const zoneLabels = {
    recovery: 'Recovery',
    endurance: 'Endurance',
    tempo: 'Tempo',
    sweet_spot: 'Sweet Spot',
    threshold: 'Threshold',
    vo2max: 'VO2max',
    anaerobic: 'Anaerobic'
  };

  // Get top 4 zones by percentage
  const topZones = Object.entries(patterns.zonePercentages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .filter(([, pct]) => pct > 0);

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="xs">
            <BarChart3 size={20} />
            <Text fw={600}>Training Patterns</Text>
            <Badge size="sm" variant="light" color="blue">
              {patterns.totalRides} rides (28d)
            </Badge>
          </Group>
          <ActionIcon
            variant="light"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </ActionIcon>
        </Group>

        {/* Training Balance Badge */}
        <Group>
          <Badge
            size="md"
            variant="light"
            color={balanceInfo.color}
            leftSection={balanceInfo.icon}
          >
            {balanceInfo.label}
          </Badge>
          <Text size="xs" c="dimmed">
            {balanceInfo.description}
          </Text>
        </Group>

        <Collapse in={expanded}>
          <Stack gap="md">
            {/* Intensity Distribution */}
            <Card withBorder p="sm">
              <Stack gap="xs">
                <Text size="sm" fw={600}>Intensity Distribution</Text>
                <SimpleGrid cols={3}>
                  <Tooltip label="Recovery & Endurance">
                    <Stack gap={2}>
                      <Text size="xs" c="dimmed">Low</Text>
                      <Text size="lg" fw={700} c="green">
                        {patterns.lowIntensity.toFixed(0)}%
                      </Text>
                    </Stack>
                  </Tooltip>
                  <Tooltip label="Tempo & Sweet Spot">
                    <Stack gap={2}>
                      <Text size="xs" c="dimmed">Medium</Text>
                      <Text size="lg" fw={700} c="yellow">
                        {patterns.mediumIntensity.toFixed(0)}%
                      </Text>
                    </Stack>
                  </Tooltip>
                  <Tooltip label="Threshold & VO2max">
                    <Stack gap={2}>
                      <Text size="xs" c="dimmed">High</Text>
                      <Text size="lg" fw={700} c="red">
                        {patterns.highIntensity.toFixed(0)}%
                      </Text>
                    </Stack>
                  </Tooltip>
                </SimpleGrid>
              </Stack>
            </Card>

            {/* Zone Breakdown */}
            <Card withBorder p="sm">
              <Stack gap="xs">
                <Text size="sm" fw={600}>Zone Distribution</Text>
                {topZones.map(([zone, percentage]) => (
                  <Stack key={zone} gap={4}>
                    <Group justify="space-between">
                      <Group gap="xs">
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 2,
                            backgroundColor: zoneColors[zone]
                          }}
                        />
                        <Text size="sm">{zoneLabels[zone]}</Text>
                      </Group>
                      <Text size="sm" fw={600}>
                        {percentage.toFixed(0)}%
                      </Text>
                    </Group>
                    <Progress
                      value={percentage}
                      color={zoneColors[zone]}
                      size="sm"
                    />
                  </Stack>
                ))}
              </Stack>
            </Card>

            {/* Weekly TSS Trend */}
            <Card withBorder p="sm">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" fw={600}>Weekly TSS</Text>
                  <Text size="sm" c="dimmed">
                    Avg: {patterns.avgWeeklyTSS.toFixed(0)}
                  </Text>
                </Group>
                <Group gap="xs" grow>
                  {patterns.weeklyTSS.map((tss, idx) => (
                    <Tooltip key={idx} label={`Week ${idx + 1}: ${tss.toFixed(0)} TSS`}>
                      <Stack gap={2} align="center">
                        <div
                          style={{
                            width: '100%',
                            height: `${Math.max(20, (tss / Math.max(...patterns.weeklyTSS)) * 60)}px`,
                            backgroundColor: '#3b82f6',
                            borderRadius: 4
                          }}
                        />
                        <Text size="xs" c="dimmed">
                          W{idx + 1}
                        </Text>
                      </Stack>
                    </Tooltip>
                  ))}
                </Group>
              </Stack>
            </Card>

            {/* Training Monotony */}
            {patterns.monotony > 2 && (
              <Alert icon={<AlertTriangle size={16} />} color="yellow" variant="light">
                <Text size="sm">
                  High training monotony detected. Consider varying your workout types for better adaptation.
                </Text>
              </Alert>
            )}
          </Stack>
        </Collapse>
      </Stack>
    </Card>
  );
}
