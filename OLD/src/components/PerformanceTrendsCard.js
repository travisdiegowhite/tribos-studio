import React, { useState, useEffect } from 'react';
import {
  Card,
  Stack,
  Text,
  Group,
  Badge,
  Button,
  Tooltip,
  Alert,
  Collapse,
  ActionIcon,
  Progress,
  Loader
} from '@mantine/core';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
  Zap,
  Target,
  Activity
} from 'lucide-react';
import {
  getActiveTrends,
  detectAllTrends,
  formatTrendForDisplay,
  groupTrendsByCategory,
  getTrendSummary,
  shouldAlertUser
} from '../services/performanceTrends';
import { notifications } from '@mantine/notifications';

export default function PerformanceTrendsCard({ user, onRefresh }) {
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (user?.id) {
      loadTrends();
    }
  }, [user]);

  const loadTrends = async () => {
    setLoading(true);
    try {
      const [trendsData, summaryData] = await Promise.all([
        getActiveTrends(user.id),
        getTrendSummary(user.id)
      ]);
      setTrends(trendsData);
      setSummary(summaryData);

      // Show notification for high-priority trends
      const alertTrends = trendsData.filter(shouldAlertUser);
      if (alertTrends.length > 0 && !sessionStorage.getItem(`trends_shown_${user.id}`)) {
        notifications.show({
          title: 'Performance Insights',
          message: `${alertTrends.length} significant trend${alertTrends.length > 1 ? 's' : ''} detected!`,
          color: 'blue',
          autoClose: 5000
        });
        sessionStorage.setItem(`trends_shown_${user.id}`, 'true');
      }
    } catch (error) {
      console.error('Error loading trends:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDetectTrends = async () => {
    setDetecting(true);
    try {
      const result = await detectAllTrends(user.id, 28);

      notifications.show({
        title: 'Trends Detected',
        message: `Found ${result?.trend_count || 0} performance trends`,
        color: 'green'
      });

      await loadTrends();
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Error detecting trends:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to detect trends',
        color: 'red'
      });
    } finally {
      setDetecting(false);
    }
  };

  const getTrendIcon = (trend) => {
    const iconMap = {
      ftp_improvement: <Zap size={16} />,
      ftp_decline: <Zap size={16} />,
      zone_fitness: <Target size={16} />,
      volume_increase: <Activity size={16} />,
      volume_decrease: <Activity size={16} />
    };

    return iconMap[trend.trend_type] || <Activity size={16} />;
  };

  const getTrendDirectionIcon = (direction) => {
    if (direction === 'improving') return <TrendingUp size={14} color="green" />;
    if (direction === 'declining') return <TrendingDown size={14} color="orange" />;
    return <Minus size={14} color="gray" />;
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.85) return 'green';
    if (confidence >= 0.70) return 'blue';
    return 'yellow';
  };

  const grouped = groupTrendsByCategory(trends);

  if (loading) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Group justify="center" p="md">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">Loading performance trends...</Text>
        </Group>
      </Card>
    );
  }

  if (!trends || trends.length === 0) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap="xs">
              <TrendingUp size={20} />
              <Text fw={600}>Performance Trends</Text>
            </Group>
            <Button
              size="xs"
              variant="light"
              leftSection={<RefreshCw size={14} />}
              onClick={handleDetectTrends}
              loading={detecting}
            >
              Detect Trends
            </Button>
          </Group>

          <Alert icon={<Info size={16} />} color="blue" variant="light">
            No performance trends detected yet. Click "Detect Trends" to analyze your recent training data.
          </Alert>
        </Stack>
      </Card>
    );
  }

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="xs">
            <TrendingUp size={20} />
            <Text fw={600}>Performance Trends</Text>
            <Badge size="sm" variant="light" color="blue">
              {summary?.totalActive || 0} Active
            </Badge>
          </Group>
          <Group gap="xs">
            <Tooltip label="Refresh trends">
              <ActionIcon
                variant="light"
                size="sm"
                onClick={handleDetectTrends}
                loading={detecting}
              >
                <RefreshCw size={14} />
              </ActionIcon>
            </Tooltip>
            <ActionIcon
              variant="light"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </ActionIcon>
          </Group>
        </Group>

        {/* Summary Stats */}
        {summary && (
          <Group gap="md">
            <Tooltip label="Trends showing improvement">
              <Badge
                size="sm"
                variant="light"
                color="green"
                leftSection={<TrendingUp size={12} />}
              >
                {summary.improving} Improving
              </Badge>
            </Tooltip>
            <Tooltip label="Trends showing decline">
              <Badge
                size="sm"
                variant="light"
                color="orange"
                leftSection={<TrendingDown size={12} />}
              >
                {summary.declining} Declining
              </Badge>
            </Tooltip>
            <Tooltip label="High confidence trends">
              <Badge size="sm" variant="light" color="blue">
                {summary.highConfidence} High Conf.
              </Badge>
            </Tooltip>
          </Group>
        )}

        <Collapse in={expanded}>
          <Stack gap="sm">
            {/* Power Trends */}
            {grouped.power.length > 0 && (
              <Stack gap="xs">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  Power & FTP
                </Text>
                {grouped.power.map((trend) => (
                  <TrendItem key={trend.id} trend={trend} />
                ))}
              </Stack>
            )}

            {/* Fitness Trends */}
            {grouped.fitness.length > 0 && (
              <Stack gap="xs">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  Zone Fitness
                </Text>
                {grouped.fitness.map((trend) => (
                  <TrendItem key={trend.id} trend={trend} />
                ))}
              </Stack>
            )}

            {/* Volume Trends */}
            {grouped.volume.length > 0 && (
              <Stack gap="xs">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  Training Volume
                </Text>
                {grouped.volume.map((trend) => (
                  <TrendItem key={trend.id} trend={trend} />
                ))}
              </Stack>
            )}
          </Stack>
        </Collapse>
      </Stack>
    </Card>
  );
}

function TrendItem({ trend }) {
  const getDirectionColor = (direction) => {
    if (direction === 'improving') return 'green';
    if (direction === 'declining') return 'orange';
    return 'gray';
  };

  const getDirectionIcon = (direction) => {
    if (direction === 'improving') return <TrendingUp size={14} />;
    if (direction === 'declining') return <TrendingDown size={14} />;
    return <Minus size={14} />;
  };

  const confidencePercentage = (trend.confidence * 100).toFixed(0);

  return (
    <Card p="xs" radius="sm" withBorder>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" style={{ flex: 1 }}>
          <Badge
            size="sm"
            variant="light"
            color={getDirectionColor(trend.direction)}
            leftSection={getDirectionIcon(trend.direction)}
          >
            {trend.direction}
          </Badge>
          <Text size="sm" style={{ flex: 1 }}>
            {trend.description}
          </Text>
        </Group>

        <Group gap="xs" wrap="nowrap">
          <Tooltip label={`${confidencePercentage}% confidence`}>
            <Progress.Root size="sm" style={{ width: 60 }}>
              <Progress.Section
                value={trend.confidence * 100}
                color={
                  trend.confidence >= 0.85
                    ? 'green'
                    : trend.confidence >= 0.70
                    ? 'blue'
                    : 'yellow'
                }
              />
            </Progress.Root>
          </Tooltip>
          <Tooltip label={`Active for ${trend.daysActive} days`}>
            <Text size="xs" c="dimmed">
              {trend.daysActive}d
            </Text>
          </Tooltip>
        </Group>
      </Group>
    </Card>
  );
}
