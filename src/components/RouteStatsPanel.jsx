import { Box, SimpleGrid, Text, Tooltip, Badge } from '@mantine/core';
import { IconRuler, IconMountain, IconClock, IconBolt } from '@tabler/icons-react';
import { tokens } from '../theme';

/**
 * RouteStatsPanel - Redesigned route stats with icons and grid layout
 * @param {object} stats - { distance, elevation, duration }
 * @param {string} routingSource - The routing engine used
 * @param {object} speedProfile - User's speed profile from Strava
 * @param {function} formatDist - Distance formatter function
 * @param {function} formatElev - Elevation formatter function
 * @param {function} formatSpd - Speed formatter function
 * @param {function} getUserSpeedForProfile - Function to get speed for profile
 * @param {string} routeProfile - Current route profile (road, gravel, etc)
 */
function RouteStatsPanel({
  stats,
  routingSource,
  speedProfile,
  formatDist,
  formatElev,
  formatSpd,
  getUserSpeedForProfile,
  routeProfile,
}) {
  const getRoutingSourceLabel = (source) => {
    switch (source) {
      case 'stadia_maps': return 'Stadia Maps (Valhalla)';
      case 'brouter': return 'BRouter';
      case 'brouter_gravel': return 'BRouter Gravel';
      case 'mapbox_fallback': return 'Mapbox';
      default: return source || 'Unknown';
    }
  };

  const statItems = [
    {
      icon: <IconRuler size={20} />,
      label: 'Distance',
      value: formatDist(stats.distance),
      color: tokens.colors.electricLime,
    },
    {
      icon: <IconMountain size={20} />,
      label: 'Elevation',
      value: stats.elevation > 0 ? `${formatElev(stats.elevation)} ↗` : '--',
      color: tokens.colors.zone4,
    },
    {
      icon: <IconClock size={20} />,
      label: 'Est. Time',
      value: stats.duration > 0
        ? `${Math.floor(stats.duration / 60)}h ${stats.duration % 60}m`
        : '--:--',
      color: tokens.colors.zone1,
    },
    {
      icon: <IconBolt size={20} />,
      label: 'Your Speed',
      value: speedProfile
        ? formatSpd(getUserSpeedForProfile(routeProfile) || speedProfile.average_speed)
        : '--',
      color: tokens.colors.zone6,
      tooltip: speedProfile ? `Based on ${speedProfile.rides_analyzed} Strava rides` : null,
    },
  ];

  return (
    <Box
      style={{
        backgroundColor: tokens.colors.bgTertiary,
        borderRadius: tokens.radius.md,
        padding: tokens.spacing.md,
      }}
    >
      <SimpleGrid cols={{ base: 2 }} spacing="sm">
        {statItems.map((item, index) => (
          <Tooltip
            key={index}
            label={item.tooltip}
            disabled={!item.tooltip}
            position="top"
          >
            <Box
              style={{
                backgroundColor: tokens.colors.bgSecondary,
                borderRadius: tokens.radius.md,
                padding: '12px',
                textAlign: 'center',
                border: `1px solid ${tokens.colors.bgElevated}`,
              }}
            >
              <Box
                style={{
                  color: item.color,
                  marginBottom: '4px',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                {item.icon}
              </Box>
              <Text
                size="lg"
                fw={700}
                style={{ color: tokens.colors.textPrimary, marginBottom: '2px' }}
              >
                {item.value}
              </Text>
              <Text size="xs" style={{ color: tokens.colors.textMuted }}>
                {item.label}
              </Text>
            </Box>
          </Tooltip>
        ))}
      </SimpleGrid>

      {/* Routing source indicator */}
      {routingSource && (
        <Box
          style={{
            marginTop: tokens.spacing.sm,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <Tooltip label={getRoutingSourceLabel(routingSource)}>
            <Badge size="xs" variant="light" color="blue">
              Powered by{' '}
              {routingSource === 'stadia_maps'
                ? 'Valhalla'
                : routingSource === 'brouter' || routingSource === 'brouter_gravel'
                ? 'BRouter'
                : 'Mapbox'}
            </Badge>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}

export default RouteStatsPanel;
