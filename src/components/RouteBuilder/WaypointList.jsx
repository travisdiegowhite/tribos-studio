import { useCallback } from 'react';
import { Stack, Group, Text, ActionIcon, Tooltip, Paper } from '@mantine/core';
import { IconGripVertical, IconTrash, IconChevronUp, IconChevronDown, IconMapPin } from '@tabler/icons-react';

/**
 * WaypointList — displays waypoints in the sidebar with reorder/remove controls.
 *
 * Props:
 *   waypoints       - Array of { id, position, type, name }
 *   onReorder       - (fromIndex, toIndex) => void
 *   onRemove        - (waypointId) => void
 *   onFocus         - (waypoint) => void — pan map to this waypoint
 */
const WaypointList = ({ waypoints, onReorder, onRemove, onFocus }) => {
  if (!waypoints || waypoints.length === 0) return null;

  const getMarkerColor = (index) => {
    if (index === 0) return '#6B8C72'; // sage — start
    if (index === waypoints.length - 1) return '#9E5A3C'; // terracotta — end
    return '#5C7A5E'; // teal — intermediate
  };

  const getLabel = (index) => {
    if (index === 0) return 'S';
    if (index === waypoints.length - 1) return 'E';
    return index;
  };

  return (
    <Stack gap={4}>
      <Text size="xs" fw={600} style={{ color: 'var(--tribos-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Waypoints ({waypoints.length})
      </Text>
      {waypoints.map((wp, index) => (
        <Paper
          key={wp.id}
          p={6}
          style={{
            backgroundColor: 'var(--tribos-bg-tertiary)',
            borderRadius: 6,
            border: '1px solid transparent',
          }}
        >
          <Group gap={6} wrap="nowrap">
            {/* Marker indicator */}
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                backgroundColor: getMarkerColor(index),
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {getLabel(index)}
            </div>

            {/* Name / coordinates */}
            <Tooltip label="Pan to waypoint" openDelay={400}>
              <Text
                size="xs"
                style={{
                  color: 'var(--tribos-text-primary)',
                  flex: 1,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => onFocus?.(wp)}
              >
                {wp.name || `Waypoint ${index + 1}`}
              </Text>
            </Tooltip>

            {/* Move up */}
            <ActionIcon
              variant="subtle"
              color="gray"
              size="xs"
              disabled={index === 0}
              onClick={() => onReorder(index, index - 1)}
            >
              <IconChevronUp size={14} />
            </ActionIcon>

            {/* Move down */}
            <ActionIcon
              variant="subtle"
              color="gray"
              size="xs"
              disabled={index === waypoints.length - 1}
              onClick={() => onReorder(index, index + 1)}
            >
              <IconChevronDown size={14} />
            </ActionIcon>

            {/* Remove */}
            <ActionIcon
              variant="subtle"
              color="red"
              size="xs"
              onClick={() => onRemove(wp.id)}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        </Paper>
      ))}
    </Stack>
  );
};

export default WaypointList;
