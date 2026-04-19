import { Box, Group, Skeleton, Stack, Text } from '@mantine/core';
import { PERSONAS } from '../../data/coachingPersonas';
import useTodayHero from '../../hooks/useTodayHero';

/**
 * Tone → colour mapping (spec §4.10).
 *   positive → teal   #2A8C82
 *   effort   → orange #D4600A
 *   fatigue  → coral  #C43C2A
 *   neutral  → ink    #141410
 */
const TONE_COLOR = {
  positive: 'var(--color-teal, #2A8C82)',
  effort: 'var(--color-orange, #D4600A)',
  fatigue: 'var(--color-coral, #C43C2A)',
  neutral: 'var(--color-ink, #141410)',
};

function formatToday() {
  try {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function dominantTone(segments) {
  const priority = ['fatigue', 'effort', 'positive', 'neutral'];
  const found = new Set(
    segments
      .filter((s) => s?.kind === 'highlight')
      .map((s) => s.tone || 'neutral'),
  );
  for (const t of priority) if (found.has(t)) return t;
  return 'neutral';
}

/**
 * TodayHero — archetype-voiced paragraph.
 *
 * Renders a HeroParagraph (HeroSegment[]) of `text | highlight` segments.
 * Highlights are bold and tone-coloured; plain text stays in ink.
 */
export default function TodayHero() {
  const { paragraph, archetype, loading, error } = useTodayHero();

  const archetypeLabel = archetype && PERSONAS[archetype]
    ? PERSONAS[archetype].name
    : 'Coach';

  const segments = Array.isArray(paragraph) ? paragraph : paragraph?.segments || [];
  const borderTone = dominantTone(segments);

  return (
    <Box
      data-testid="today-hero"
      style={{
        borderLeft: `3px solid ${TONE_COLOR[borderTone]}`,
        padding: '18px 22px 18px 20px',
        backgroundColor: 'var(--color-card, #FFFFFF)',
        border: '1px solid var(--color-border, #DDDDD8)',
        borderLeftWidth: 3,
      }}
    >
      <Group justify="space-between" mb={10} wrap="nowrap">
        <Text
          fw={600}
          style={{
            fontFamily: "'Barlow Condensed', 'Barlow', sans-serif",
            fontSize: 12,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted, #7A7970)',
          }}
        >
          Coach Check-In · {archetypeLabel}
        </Text>
        <Text
          size="xs"
          style={{
            fontFamily: "'JetBrains Mono', 'DM Mono', monospace",
            color: 'var(--color-text-muted, #7A7970)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          {formatToday()}
        </Text>
      </Group>

      {loading && segments.length === 0 ? (
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
            color: 'var(--color-text-muted, #7A7970)',
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
            color: 'var(--color-text-muted, #7A7970)',
          }}
        >
          No check-in yet — ride or set a plan to get started.
        </Text>
      ) : (
        <Text
          style={{
            fontFamily: "'Barlow', sans-serif",
            fontSize: 17,
            lineHeight: 1.4,
            color: 'var(--color-ink, #141410)',
          }}
        >
          {segments.map((seg, idx) => {
            if (!seg || !seg.kind) return null;
            if (seg.kind === 'highlight') {
              const tone = TONE_COLOR[seg.tone] || TONE_COLOR.neutral;
              return (
                <span
                  key={idx}
                  data-tone={seg.tone}
                  style={{ color: tone, fontWeight: 700 }}
                >
                  {seg.value}
                </span>
              );
            }
            // text
            return <span key={idx}>{seg.value}</span>;
          })}
        </Text>
      )}
    </Box>
  );
}
