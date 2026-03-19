import { Box, Group, Text, Badge, Stack } from '@mantine/core';
import { Path, Mountains } from '@phosphor-icons/react';

function getMatchColor(score) {
  if (score >= 90) return 'green';
  if (score >= 75) return 'teal';
  if (score >= 60) return 'blue';
  if (score >= 45) return 'yellow';
  return 'gray';
}

function MatchedRouteCard({ match, formatDist, formatElev, onClick }) {
  const activity = match.activity || {};
  const score = match.matchScore || match.score || 0;
  const reasons = match.reasons || match.matchReasons || [];
  const distanceKm = activity.distance ? activity.distance / 1000 : null;

  return (
    <Box
      style={{
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-card)',
        padding: 16,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 200ms',
      }}
      onClick={onClick}
    >
      <Stack gap="sm">
        {/* Route name and match score */}
        <Group justify="space-between" align="flex-start">
          <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
            <Path size={18} color="var(--color-teal)" style={{ flexShrink: 0 }} />
            <Text
              fw={600}
              style={{
                fontSize: 15,
                color: 'var(--color-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {activity.name || 'Matched Route'}
            </Text>
          </Group>
          <Badge
            variant="light"
            color={getMatchColor(score)}
            size="sm"
            style={{ fontFamily: "'DM Mono', monospace", flexShrink: 0 }}
          >
            {score}%
          </Badge>
        </Group>

        {/* Stats row */}
        <Group gap="lg">
          {distanceKm && (
            <Box>
              <Text
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-muted)',
                  marginBottom: 2,
                }}
              >
                DISTANCE
              </Text>
              <Text
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                }}
              >
                {formatDist ? formatDist(distanceKm) : `${Math.round(distanceKm)} km`}
              </Text>
            </Box>
          )}
          {activity.total_elevation_gain && (
            <Box>
              <Text
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-muted)',
                  marginBottom: 2,
                }}
              >
                ELEVATION
              </Text>
              <Text
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                }}
              >
                {formatElev ? formatElev(activity.total_elevation_gain) : `${Math.round(activity.total_elevation_gain)} m`}
              </Text>
            </Box>
          )}
          {match.terrainType && (
            <Box>
              <Text
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-muted)',
                  marginBottom: 2,
                }}
              >
                TERRAIN
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: 'var(--color-text-secondary)',
                }}
              >
                {match.terrainType}
              </Text>
            </Box>
          )}
        </Group>

        {/* Match reasons */}
        {reasons.length > 0 && (
          <Group gap="xs">
            {reasons.slice(0, 2).map((reason, i) => (
              <Text
                key={i}
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                  fontStyle: 'italic',
                }}
              >
                {reason}
              </Text>
            ))}
          </Group>
        )}
      </Stack>
    </Box>
  );
}

export default MatchedRouteCard;
