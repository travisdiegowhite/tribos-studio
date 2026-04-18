import { Box, Group, Stack, Text, Skeleton } from '@mantine/core';
import { PERSONAS } from '../../data/coachingPersonas';
import useTodayHero from '../../hooks/useTodayHero';

/**
 * Map assembler tone tags to the existing Tribos colour tokens. We avoid
 * bolding or heavy colour — tone is applied as a subtle left-border accent
 * and, for non-neutral segments, a slightly warmer text colour.
 */
const TONE_BORDER = {
  positive: 'var(--color-teal)',
  neutral: 'var(--color-border)',
  caution: 'var(--color-ochre, var(--color-orange))',
  warning: 'var(--color-orange)',
};

function toneColor(tone) {
  if (tone === 'warning') return 'var(--color-orange)';
  if (tone === 'caution') return 'var(--color-ochre, var(--color-orange))';
  return 'var(--color-text-primary)';
}

function formatToday() {
  try {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * TodayHero — archetype-voiced paragraph at the top of the dashboard.
 *
 * Renders HeroSegment[] as inline spans. The header row shows the coach
 * archetype and today's date so the rider lands with a clear sense of
 * "who is talking" and "when this was written".
 */
export default function TodayHero() {
  const { paragraph, archetype, loading, error } = useTodayHero();

  const archetypeLabel = archetype && PERSONAS[archetype]
    ? PERSONAS[archetype].name
    : 'Coach';

  // Dominant tone drives the left-border accent. We pick the first
  // non-neutral segment or fall back to neutral.
  const segments = paragraph?.segments || [];
  const dominant = segments.find((s) => s.tone && s.tone !== 'neutral')?.tone || 'neutral';

  return (
    <Box
      data-testid="today-hero"
      style={{
        borderLeft: `3px solid ${TONE_BORDER[dominant] || TONE_BORDER.neutral}`,
        padding: '18px 20px',
        backgroundColor: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderLeftWidth: 3,
      }}
    >
      <Group justify="space-between" mb={10} wrap="nowrap">
        <Text
          fw={600}
          style={{
            fontFamily: "'Barlow Condensed', 'Barlow', sans-serif",
            fontSize: 12,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
          }}
        >
          Coach Check-In · {archetypeLabel}
        </Text>
        <Text
          size="xs"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--color-text-muted)',
          }}
        >
          {formatToday()}
        </Text>
      </Group>

      {loading && !paragraph ? (
        <Stack gap={6}>
          <Skeleton height={14} width="92%" />
          <Skeleton height={14} width="86%" />
          <Skeleton height={14} width="74%" />
        </Stack>
      ) : error ? (
        <Text
          style={{
            fontFamily: "'Barlow', sans-serif",
            fontSize: 14,
            color: 'var(--color-text-muted)',
            fontStyle: 'italic',
          }}
        >
          Coach check-in is offline for the moment.
        </Text>
      ) : segments.length === 0 ? (
        <Text
          style={{
            fontFamily: "'Barlow', sans-serif",
            fontSize: 15,
            color: 'var(--color-text-muted)',
          }}
        >
          No check-in yet — ride or set a plan to get started.
        </Text>
      ) : (
        <Text
          style={{
            fontFamily: "'Barlow', sans-serif",
            fontSize: 16,
            lineHeight: 1.6,
            color: 'var(--color-text-primary)',
          }}
        >
          {segments.map((seg, idx) => (
            <span
              key={`${seg.type}-${idx}`}
              data-segment={seg.type}
              style={{ color: toneColor(seg.tone) }}
            >
              {seg.text}
              {idx < segments.length - 1 ? ' ' : ''}
            </span>
          ))}
        </Text>
      )}
    </Box>
  );
}
