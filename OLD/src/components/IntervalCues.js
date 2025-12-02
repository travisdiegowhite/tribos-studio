import React from 'react';
import { Card, Text, Stack, Group, Badge, Timeline, ThemeIcon } from '@mantine/core';
import { Activity, TrendingUp, Zap, Mountain, Heart } from 'lucide-react';
import { getZoneColor, getZoneName } from '../utils/intervalCues';
import { useUnits } from '../utils/units';

const IntervalCues = ({ cues }) => {
  const { formatDistance, distanceUnit } = useUnits();

  if (!cues || cues.length === 0) {
    return null;
  }

  // Get icon for cue type
  const getIcon = (type) => {
    if (type.includes('warmup')) return <Heart size={16} />;
    if (type.includes('cooldown')) return <Heart size={16} />;
    if (type.includes('interval')) return <Zap size={16} />;
    if (type.includes('hill')) return <Mountain size={16} />;
    if (type.includes('surge') || type.includes('tempo')) return <TrendingUp size={16} />;
    return <Activity size={16} />;
  };

  // Get color for cue type - uses zone-based colors to match map display
  const getCueColor = (cue) => {
    // Use zone-based colors for visual consistency with map route segments
    return getZoneColor(cue.zone);
  };

  // Build instruction with user's preferred units
  const buildInstruction = (cue) => {
    const parts = [];

    // Type/description
    const typeLabel = cue.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    parts.push(typeLabel);

    // Zone
    parts.push(`Zone ${cue.zone}`);

    // Duration and distance
    if (cue.duration) {
      parts.push(`for ${cue.duration}min (${formatDistance(cue.distance)})`);
    } else if (cue.distance) {
      parts.push(`for ${formatDistance(cue.distance)}`);
    }

    // Power target
    if (cue.powerPctFTP) {
      parts.push(`@ ${cue.powerPctFTP}% FTP`);
    }

    // Cadence
    if (cue.cadence) {
      parts.push(`| ${cue.cadence} rpm`);
    }

    return parts.join(' ');
  };

  return (
    <Card withBorder p="md" style={{ backgroundColor: '#3d4e5e' }}>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Text size="sm" fw={600} c="#F5F5F5">
            Workout Structure
          </Text>
          <Badge color="blue" variant="light" size="sm">
            {cues.length} segments
          </Badge>
        </Group>

        <Timeline active={cues.length} bulletSize={24} lineWidth={2}>
          {cues.map((cue, index) => (
            <Timeline.Item
              key={index}
              bullet={
                <ThemeIcon
                  size={24}
                  variant="filled"
                  color={getCueColor(cue)}
                  radius="xl"
                >
                  {getIcon(cue.type)}
                </ThemeIcon>
              }
              title={
                <Group gap="xs">
                  <Text size="sm" fw={500}>
                    {cue.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Text>
                  <Badge size="xs" color={getZoneColor(cue.zone)} variant="filled">
                    Zone {cue.zone}
                  </Badge>
                </Group>
              }
            >
              <Text size="xs" c="dimmed" mt={4}>
                {buildInstruction(cue)}
              </Text>
              <Text size="xs" c="dimmed" mt={2}>
                📍 At {formatDistance(cue.startDistance)} - {formatDistance(cue.endDistance)}
              </Text>
            </Timeline.Item>
          ))}
        </Timeline>

        <Card withBorder p="xs" style={{ backgroundColor: '#475569' }}>
          <Text size="xs" fw={500} mb="xs" c="#E8E8E8">
            Training Zones Reference:
          </Text>
          <Stack gap={4}>
            {[1, 2, 3, 4, 5].map((zone) => (
              <Group key={zone} gap="xs">
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: getZoneColor(zone),
                  }}
                />
                <Text size="xs" c="dimmed">
                  Zone {zone}: {getZoneName(zone)}
                </Text>
              </Group>
            ))}
          </Stack>
        </Card>
      </Stack>
    </Card>
  );
};

export default IntervalCues;
