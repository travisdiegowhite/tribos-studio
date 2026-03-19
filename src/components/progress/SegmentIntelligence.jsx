import { Link } from 'react-router-dom';
import { Box, Group, Text, Button, Skeleton } from '@mantine/core';
import { CaretRight } from '@phosphor-icons/react';

function SegmentIntelligence({ segments, loading }) {
  if (loading) {
    return (
      <Box
        style={{
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-card)',
          padding: 16,
        }}
      >
        <Skeleton height={12} width={120} mb={12} />
        <Skeleton height={20} width={40} mb={8} />
        <Skeleton height={14} width="80%" />
      </Box>
    );
  }

  const totalSegments = segments?.length || 0;

  // Count segments ridden in last 30 days
  const recentlyRidden = (segments || []).filter(s => {
    if (!s.last_ridden_at) return false;
    const lastRidden = new Date(s.last_ridden_at);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return lastRidden >= thirtyDaysAgo;
  }).length;

  // Find most ridden segment
  const topSegment = (segments || []).reduce((top, s) => {
    if (!top || (s.ride_count || 0) > (top.ride_count || 0)) return s;
    return top;
  }, null);

  // Count terrain types
  const terrainCounts = (segments || []).reduce((acc, s) => {
    const type = s.terrain_type || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  const topTerrain = Object.entries(terrainCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type)[0] || null;

  return (
    <Box
      style={{
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-card)',
        padding: 16,
      }}
    >
      <Group justify="space-between" mb={14}>
        <Text
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
          }}
        >
          SEGMENTS
        </Text>
        <Button
          component={Link}
          to="/train?tab=routes"
          variant="subtle"
          color="gray"
          size="compact-xs"
          rightSection={<CaretRight size={12} />}
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
          }}
        >
          VIEW ALL
        </Button>
      </Group>

      {totalSegments === 0 ? (
        <Text size="sm" style={{ color: 'var(--color-text-muted)' }}>
          No segments analyzed yet. Analyze your rides in the Training tab to build your segment library.
        </Text>
      ) : (
        <>
          {/* Total segments */}
          <Group gap="xl" mb={10}>
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
                TOTAL
              </Text>
              <Text
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--color-teal)',
                  lineHeight: 1.2,
                }}
              >
                {totalSegments}
              </Text>
            </Box>
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
                ACTIVE (30D)
              </Text>
              <Text
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                  lineHeight: 1.2,
                }}
              >
                {recentlyRidden}
              </Text>
            </Box>
          </Group>

          {/* Top segment */}
          {topSegment && (
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
                MOST RIDDEN
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: 'var(--color-text-secondary)',
                }}
                lineClamp={1}
              >
                {topSegment.display_name || topSegment.auto_name || 'Unnamed Segment'}
                {topSegment.ride_count ? ` (${topSegment.ride_count}x)` : ''}
              </Text>
            </Box>
          )}

          {/* Top terrain */}
          {topTerrain && (
            <Box mt={8}>
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
                PRIMARY TERRAIN
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: 'var(--color-text-secondary)',
                  textTransform: 'capitalize',
                }}
              >
                {topTerrain}
              </Text>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

export default SegmentIntelligence;
