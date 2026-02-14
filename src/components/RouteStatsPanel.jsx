import { Box, SimpleGrid, Text, Tooltip, Badge, Stack } from '@mantine/core';
import { IconRuler, IconMountain, IconClock, IconBolt, IconUser, IconTrendingUp } from '@tabler/icons-react';
import { tokens } from '../theme';

/**
 * RouteStatsPanel - Route stats with icons, grid layout, and personalized ETA
 * @param {object} stats - { distance, elevation, duration }
 * @param {string} routingSource - The routing engine used
 * @param {object} speedProfile - User's speed profile from Strava
 * @param {function} formatDist - Distance formatter function
 * @param {function} formatElev - Elevation formatter function
 * @param {function} formatSpd - Speed formatter function
 * @param {function} getUserSpeedForProfile - Function to get speed for profile
 * @param {string} routeProfile - Current route profile (road, gravel, etc)
 * @param {object} personalizedETA - Output from calculatePersonalizedETA()
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
  personalizedETA,
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

  // Use personalized ETA if available, fall back to raw routing duration
  const hasETA = personalizedETA && personalizedETA.totalSeconds > 0;
  const rawDuration = stats.duration > 0
    ? `${Math.floor(stats.duration / 60)}h ${stats.duration % 60}m`
    : null;

  const statItems = [
    {
      icon: <IconRuler size={20} />,
      label: 'Distance',
      value: formatDist(stats.distance),
      color: 'var(--tribos-terracotta-500)',
    },
    {
      icon: <IconMountain size={20} />,
      label: 'Elevation',
      value: stats.elevation > 0 ? `${formatElev(stats.elevation)} ↗` : '--',
      color: tokens.colors.zone4,
    },
    {
      icon: hasETA ? <IconUser size={20} /> : <IconClock size={20} />,
      label: hasETA ? 'Your ETA' : 'Est. Time',
      value: hasETA
        ? personalizedETA.formattedTime
        : (rawDuration || '--:--'),
      color: hasETA ? 'var(--tribos-terracotta-500)' : tokens.colors.zone1,
      tooltip: hasETA
        ? buildETATooltip(personalizedETA, rawDuration)
        : null,
    },
    {
      icon: <IconBolt size={20} />,
      label: hasETA ? 'Eff. Speed' : 'Your Speed',
      value: hasETA
        ? formatSpd(personalizedETA.effectiveSpeed)
        : (speedProfile
          ? formatSpd(getUserSpeedForProfile(routeProfile) || speedProfile.average_speed)
          : '--'),
      color: tokens.colors.zone6,
      tooltip: hasETA
        ? `Terrain-adjusted avg speed (flat: ${formatSpd(personalizedETA.breakdown.baseSpeed)})`
        : (speedProfile ? `Based on ${speedProfile.rides_analyzed} Strava rides` : null),
    },
  ];

  return (
    <Box
      style={{
        backgroundColor: 'var(--tribos-bg-tertiary)',
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
            multiline
            w={240}
          >
            <Box
              style={{
                backgroundColor: 'var(--tribos-bg-secondary)',
                borderRadius: tokens.radius.md,
                padding: '12px',
                textAlign: 'center',
                border: `1px solid ${'var(--tribos-bg-elevated)'}`,
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
                style={{ color: 'var(--tribos-text-primary)', marginBottom: '2px' }}
              >
                {item.value}
              </Text>
              <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                {item.label}
              </Text>
            </Box>
          </Tooltip>
        ))}
      </SimpleGrid>

      {/* Personalized ETA breakdown bar */}
      {hasETA && (
        <ETABreakdownBar breakdown={personalizedETA.breakdown} isPersonalized={personalizedETA.isPersonalized} />
      )}

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

/**
 * Compact horizontal bar showing what factors affected the ETA
 */
function ETABreakdownBar({ breakdown, isPersonalized }) {
  const factors = [];

  if (breakdown.surfaceModifier < 0.98) {
    const pct = Math.round((1 - breakdown.surfaceModifier) * 100);
    factors.push({ label: `Surface -${pct}%`, color: '#D97706' });
  }
  if (breakdown.avgGradeModifier < 0.95) {
    const pct = Math.round((1 - breakdown.avgGradeModifier) * 100);
    factors.push({ label: `Climbing -${pct}%`, color: tokens.colors.zone4 });
  }
  if (breakdown.avgFatigueModifier < 0.98) {
    const pct = Math.round((1 - breakdown.avgFatigueModifier) * 100);
    factors.push({ label: `Fatigue -${pct}%`, color: tokens.colors.zone5 });
  }
  if (breakdown.goalModifier < 0.98) {
    const pct = Math.round((1 - breakdown.goalModifier) * 100);
    factors.push({ label: `Goal -${pct}%`, color: tokens.colors.zone1 });
  } else if (breakdown.goalModifier > 1.02) {
    const pct = Math.round((breakdown.goalModifier - 1) * 100);
    factors.push({ label: `Goal +${pct}%`, color: 'var(--tribos-terracotta-500)' });
  }

  return (
    <Box
      style={{
        marginTop: tokens.spacing.sm,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Badge
        size="xs"
        variant="light"
        color={isPersonalized ? 'terracotta' : 'gray'}
        leftSection={isPersonalized ? <IconUser size={10} /> : <IconTrendingUp size={10} />}
      >
        {isPersonalized ? 'Strava-tuned' : 'Default speed'}
      </Badge>
      {factors.map((f, i) => (
        <Badge key={i} size="xs" variant="outline" style={{ borderColor: f.color, color: f.color }}>
          {f.label}
        </Badge>
      ))}
    </Box>
  );
}

function buildETATooltip(eta, rawDuration) {
  const { breakdown } = eta;
  const lines = [
    `Base speed: ${breakdown.baseSpeed} km/h`,
  ];
  if (breakdown.surfaceModifier < 1.0) {
    lines.push(`Surface: ${Math.round(breakdown.surfaceModifier * 100)}% of paved speed`);
  }
  if (breakdown.avgGradePercent > 0) {
    lines.push(`Avg grade: ${breakdown.avgGradePercent}%`);
  }
  if (rawDuration) {
    lines.push(`Flat estimate: ${rawDuration}`);
  }
  return lines.join('\n');
}

export default RouteStatsPanel;
