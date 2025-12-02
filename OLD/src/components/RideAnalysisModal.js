import React, { useState, useEffect } from 'react';
import {
  Modal,
  Tabs,
  Stack,
  Text,
  Group,
  Badge,
  Card,
  SimpleGrid,
  Progress,
  Tooltip,
  Alert,
  Loader,
  RingProgress,
  Table
} from '@mantine/core';
import {
  PieChart,
  Activity,
  Zap,
  TrendingUp,
  Target,
  Info
} from 'lucide-react';
import {
  getRideAnalysis,
  formatZoneDistribution,
  formatPeakPowers,
  interpretEfficiencyMetrics,
  formatDuration
} from '../services/rideAnalysis';
import {
  formatDifficultyScore,
  formatPerformanceRatio
} from '../services/routeDifficulty';

export default function RideAnalysisModal({ opened, onClose, rideId, userId, rideName }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('zones');

  useEffect(() => {
    if (opened && rideId && userId) {
      loadAnalysis();
    }
  }, [opened, rideId, userId]);

  const loadAnalysis = async () => {
    setLoading(true);
    try {
      const data = await getRideAnalysis(rideId, userId);
      setAnalysis(data);
    } catch (error) {
      console.error('Error loading ride analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Modal opened={opened} onClose={onClose} title="Ride Analysis" size="lg">
        <Group justify="center" p="xl">
          <Loader size="md" />
          <Text>Analyzing ride...</Text>
        </Group>
      </Modal>
    );
  }

  if (!analysis) {
    return (
      <Modal opened={opened} onClose={onClose} title="Ride Analysis" size="lg">
        <Alert icon={<Info size={16} />} color="yellow">
          No analysis data available for this ride. Make sure the ride has power data.
        </Alert>
      </Modal>
    );
  }

  const zoneDistribution = formatZoneDistribution(analysis.zone_distribution);
  const peakPowers = formatPeakPowers(analysis.peak_powers);
  const efficiencyMetrics = interpretEfficiencyMetrics({
    variabilityIndex: analysis.variability_index,
    intensityFactor: analysis.intensity_factor,
    efficiencyFactor: analysis.efficiency_factor,
    hrPowerDecoupling: analysis.hr_power_decoupling,
    performanceRatio: analysis.performance_ratio
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Activity size={20} />
          <Text fw={600}>Ride Analysis</Text>
          {rideName && <Text size="sm" c="dimmed">- {rideName}</Text>}
        </Group>
      }
      size="xl"
    >
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="zones" leftSection={<PieChart size={14} />}>
            Zone Analysis
          </Tabs.Tab>
          <Tabs.Tab value="power" leftSection={<Zap size={14} />}>
            Peak Powers
          </Tabs.Tab>
          <Tabs.Tab value="efficiency" leftSection={<Target size={14} />}>
            Efficiency
          </Tabs.Tab>
        </Tabs.List>

        {/* Zone Analysis Tab */}
        <Tabs.Panel value="zones" pt="md">
          <Stack gap="md">
            {zoneDistribution.length > 0 ? (
              <>
                {/* Zone Distribution Pie Chart (using progress bars) */}
                <Card withBorder p="md">
                  <Stack gap="xs">
                    <Text size="sm" fw={600}>Time in Zone</Text>
                    {zoneDistribution.map((zone) => (
                      <Stack key={zone.zone} gap={4}>
                        <Group justify="space-between">
                          <Group gap="xs">
                            <div
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: 2,
                                backgroundColor: zone.color
                              }}
                            />
                            <Text size="sm">{zone.label}</Text>
                          </Group>
                          <Group gap="xs">
                            <Text size="sm" c="dimmed">
                              {formatDuration(zone.seconds)}
                            </Text>
                            <Text size="sm" fw={600}>
                              {zone.percentage.toFixed(1)}%
                            </Text>
                          </Group>
                        </Group>
                        <Progress
                          value={zone.percentage}
                          color={zone.color}
                          size="sm"
                        />
                      </Stack>
                    ))}
                  </Stack>
                </Card>

                {/* Zone Summary */}
                <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }}>
                  {zoneDistribution.slice(0, 3).map((zone) => (
                    <Card key={zone.zone} withBorder p="sm">
                      <Stack gap={4} align="center">
                        <Text size="xs" c="dimmed" tt="uppercase">
                          {zone.label}
                        </Text>
                        <Text size="lg" fw={700} style={{ color: zone.color }}>
                          {zone.minutes}m
                        </Text>
                        <Text size="xs" c="dimmed">
                          {zone.percentage.toFixed(0)}%
                        </Text>
                      </Stack>
                    </Card>
                  ))}
                </SimpleGrid>
              </>
            ) : (
              <Alert icon={<Info size={16} />} color="yellow">
                No zone data available. This ride may not have sufficient power data.
              </Alert>
            )}
          </Stack>
        </Tabs.Panel>

        {/* Peak Powers Tab */}
        <Tabs.Panel value="power" pt="md">
          <Stack gap="md">
            {peakPowers.length > 0 ? (
              <>
                <Card withBorder p="md">
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Duration</Table.Th>
                        <Table.Th>Peak Power</Table.Th>
                        <Table.Th>W/kg</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {peakPowers.map((peak) => (
                        <Table.Tr key={peak.duration}>
                          <Table.Td>
                            <Text fw={600}>{peak.label}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="lg" fw={700} c="blue">
                              {peak.power}W
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text c="dimmed">
                              {/* Would need user weight to calculate */}
                              -
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Card>

                <Alert icon={<Info size={16} />} color="blue" variant="light">
                  Peak power efforts show your best average power for standard durations. These are useful for tracking improvements over time.
                </Alert>
              </>
            ) : (
              <Alert icon={<Info size={16} />} color="yellow">
                No peak power data available.
              </Alert>
            )}
          </Stack>
        </Tabs.Panel>

        {/* Efficiency Tab */}
        <Tabs.Panel value="efficiency" pt="md">
          <Stack gap="md">
            {/* Efficiency Metrics */}
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {/* Variability Index */}
              {efficiencyMetrics?.vi && (
                <Card withBorder p="md">
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Variability Index</Text>
                      <Badge size="sm" color={efficiencyMetrics.vi.color}>
                        {efficiencyMetrics.vi.rating}
                      </Badge>
                    </Group>
                    <Text size="xl" fw={700}>
                      {analysis.variability_index?.toFixed(2)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {efficiencyMetrics.vi.description}
                    </Text>
                  </Stack>
                </Card>
              )}

              {/* Intensity Factor */}
              {efficiencyMetrics?.if && (
                <Card withBorder p="md">
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Intensity Factor</Text>
                      <Badge size="sm" color={efficiencyMetrics.if.color}>
                        {efficiencyMetrics.if.rating}
                      </Badge>
                    </Group>
                    <Text size="xl" fw={700}>
                      {analysis.intensity_factor?.toFixed(2)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {efficiencyMetrics.if.description}
                    </Text>
                  </Stack>
                </Card>
              )}

              {/* Performance Ratio */}
              {efficiencyMetrics?.performance && analysis.performance_ratio && (
                <Card withBorder p="md">
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Performance</Text>
                      <Badge size="sm" color={efficiencyMetrics.performance.color}>
                        {efficiencyMetrics.performance.rating}
                      </Badge>
                    </Group>
                    <Text size="xl" fw={700}>
                      {(analysis.performance_ratio * 100).toFixed(0)}%
                    </Text>
                    <Text size="xs" c="dimmed">
                      {efficiencyMetrics.performance.description}
                    </Text>
                  </Stack>
                </Card>
              )}

              {/* HR/Power Decoupling */}
              {efficiencyMetrics?.decoupling && analysis.hr_power_decoupling && (
                <Card withBorder p="md">
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">HR Decoupling</Text>
                      <Badge size="sm" color={efficiencyMetrics.decoupling.color}>
                        {efficiencyMetrics.decoupling.rating}
                      </Badge>
                    </Group>
                    <Text size="xl" fw={700}>
                      {analysis.hr_power_decoupling?.toFixed(1)}%
                    </Text>
                    <Text size="xs" c="dimmed">
                      {efficiencyMetrics.decoupling.description}
                    </Text>
                  </Stack>
                </Card>
              )}
            </SimpleGrid>

            {/* Efficiency Explanation */}
            <Alert icon={<Info size={16} />} color="blue" variant="light">
              <Stack gap="xs">
                <Text size="sm" fw={600}>Understanding Efficiency Metrics</Text>
                <Text size="xs">
                  <strong>VI (Variability Index):</strong> Measures pacing consistency. Lower is better (1.00-1.05 is excellent).
                </Text>
                <Text size="xs">
                  <strong>IF (Intensity Factor):</strong> Ride intensity relative to FTP. Higher means harder effort.
                </Text>
                <Text size="xs">
                  <strong>Performance:</strong> How you performed vs expected based on your fitness level.
                </Text>
                <Text size="xs">
                  <strong>HR Decoupling:</strong> Cardiac drift during the ride. Less than 5% is excellent aerobic fitness.
                </Text>
              </Stack>
            </Alert>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
