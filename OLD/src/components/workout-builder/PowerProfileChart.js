import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { Card, Stack, Group, Text, Badge } from '@mantine/core';
import { Activity, Clock, Zap } from 'lucide-react';
import { TRAINING_ZONES } from '../../utils/trainingPlans';

/**
 * PowerProfileChart
 * Visual chart showing power over time for a workout
 * Color-coded by training zones
 */
const PowerProfileChart = ({ structure, height = 300 }) => {
  // Convert workout structure to chart data points
  const chartData = useMemo(() => {
    if (!structure) return [];

    const data = [];
    let currentTime = 0;

    // Helper to add data points for an interval
    const addIntervalPoints = (duration, powerPct, label) => {
      // Add start point
      data.push({
        time: currentTime,
        power: powerPct,
        label,
        timeMinutes: currentTime
      });

      // Add end point
      currentTime += duration;
      data.push({
        time: currentTime,
        power: powerPct,
        label,
        timeMinutes: currentTime
      });
    };

    // Warmup
    if (structure.warmup) {
      addIntervalPoints(
        structure.warmup.duration,
        structure.warmup.powerPctFTP,
        'Warmup'
      );
    }

    // Main intervals
    if (structure.main && structure.main.length > 0) {
      structure.main.forEach((interval, idx) => {
        if (interval.type === 'repeat') {
          // Repeat intervals
          for (let i = 0; i < interval.sets; i++) {
            // Work interval
            addIntervalPoints(
              interval.work.duration,
              interval.work.powerPctFTP,
              `Set ${i + 1} - Work`
            );

            // Rest interval (don't add after last set)
            if (i < interval.sets - 1) {
              addIntervalPoints(
                interval.rest.duration,
                interval.rest.powerPctFTP,
                `Set ${i + 1} - Rest`
              );
            } else {
              // Add rest after last set
              addIntervalPoints(
                interval.rest.duration,
                interval.rest.powerPctFTP,
                'Recovery'
              );
            }
          }
        } else {
          // Steady state interval
          addIntervalPoints(
            interval.duration,
            interval.powerPctFTP,
            interval.description || `Interval ${idx + 1}`
          );
        }
      });
    }

    // Cooldown
    if (structure.cooldown) {
      addIntervalPoints(
        structure.cooldown.duration,
        structure.cooldown.powerPctFTP,
        'Cooldown'
      );
    }

    return data;
  }, [structure]);

  // Calculate workout metrics
  const metrics = useMemo(() => {
    if (!structure) return { duration: 0, avgPower: 0, tss: 0, if: 0 };

    let totalDuration = 0;
    let weightedPower = 0;

    // Helper to add interval metrics
    const addIntervalMetrics = (duration, powerPct) => {
      totalDuration += duration;
      weightedPower += duration * powerPct;
    };

    // Warmup
    if (structure.warmup) {
      addIntervalMetrics(structure.warmup.duration, structure.warmup.powerPctFTP);
    }

    // Main intervals
    if (structure.main && structure.main.length > 0) {
      structure.main.forEach((interval) => {
        if (interval.type === 'repeat') {
          const workDuration = interval.work.duration * interval.sets;
          const restDuration = interval.rest.duration * interval.sets;
          addIntervalMetrics(workDuration, interval.work.powerPctFTP);
          addIntervalMetrics(restDuration, interval.rest.powerPctFTP);
        } else {
          addIntervalMetrics(interval.duration, interval.powerPctFTP);
        }
      });
    }

    // Cooldown
    if (structure.cooldown) {
      addIntervalMetrics(structure.cooldown.duration, structure.cooldown.powerPctFTP);
    }

    const avgPower = totalDuration > 0 ? weightedPower / totalDuration : 0;
    const intensityFactor = avgPower / 100; // IF = normalized power / FTP
    const tss = totalDuration > 0 ? (totalDuration * 60 * intensityFactor * intensityFactor * 100) / 3600 : 0;

    return {
      duration: totalDuration,
      avgPower: Math.round(avgPower),
      tss: Math.round(tss),
      if: intensityFactor.toFixed(2)
    };
  }, [structure]);

  // Get zone color based on power percentage
  const getZoneColor = (power) => {
    if (power < 55) return '#94a3b8'; // Recovery - gray
    if (power < 75) return '#3b82f6'; // Endurance - blue
    if (power < 90) return '#10b981'; // Tempo - green
    if (power < 105) return '#f59e0b'; // Threshold - orange
    if (power < 120) return '#ef4444'; // VO2 Max - red
    return '#dc2626'; // Anaerobic - dark red
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <Card shadow="md" p="xs" withBorder>
          <Stack gap={4}>
            <Text size="xs" fw={600}>{data.label}</Text>
            <Text size="xs">Time: {data.timeMinutes} min</Text>
            <Text size="xs">Power: {data.power}% FTP</Text>
          </Stack>
        </Card>
      );
    }
    return null;
  };

  if (!structure || chartData.length === 0) {
    return (
      <Card withBorder p="md">
        <Text c="dimmed" size="sm" ta="center">
          No workout structure to display
        </Text>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      {/* Metrics Summary */}
      <Group gap="md" justify="center">
        <Badge leftSection={<Clock size={14} />} size="lg" variant="light">
          {metrics.duration} min
        </Badge>
        <Badge leftSection={<Zap size={14} />} size="lg" variant="light" color="blue">
          {metrics.avgPower}% Avg Power
        </Badge>
        <Badge leftSection={<Activity size={14} />} size="lg" variant="light" color="green">
          {metrics.tss} TSS
        </Badge>
        <Badge size="lg" variant="light" color="orange">
          IF {metrics.if}
        </Badge>
      </Group>

      {/* Power Profile Chart */}
      <Card withBorder p="md">
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              {chartData.map((point, idx) => (
                <linearGradient key={idx} id={`colorPower${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={getZoneColor(point.power)} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={getZoneColor(point.power)} stopOpacity={0.2}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="timeMinutes"
              label={{ value: 'Time (minutes)', position: 'insideBottom', offset: -5 }}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              label={{ value: 'Power (% FTP)', angle: -90, position: 'insideLeft' }}
              tick={{ fontSize: 12 }}
              domain={[0, 'dataMax + 10']}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Reference lines for zones */}
            <ReferenceLine y={55} stroke="#94a3b8" strokeDasharray="3 3" strokeOpacity={0.5} />
            <ReferenceLine y={75} stroke="#3b82f6" strokeDasharray="3 3" strokeOpacity={0.5} />
            <ReferenceLine y={90} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.5} />
            <ReferenceLine y={105} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.5} />
            <ReferenceLine y={120} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.5} />

            <Area
              type="stepAfter"
              dataKey="power"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#colorPower0)"
              fillOpacity={1}
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Zone Legend */}
        <Group gap="xs" justify="center" mt="md">
          <Badge size="xs" color="gray">Z1: &lt;55%</Badge>
          <Badge size="xs" color="blue">Z2: 55-75%</Badge>
          <Badge size="xs" color="green">Z3: 75-90%</Badge>
          <Badge size="xs" color="orange">Z4: 90-105%</Badge>
          <Badge size="xs" color="red">Z5: 105-120%</Badge>
          <Badge size="xs" color="red" variant="filled">Z6: &gt;120%</Badge>
        </Group>
      </Card>
    </Stack>
  );
};

export default PowerProfileChart;
