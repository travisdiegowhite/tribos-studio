/**
 * FARCard — Fitness Acquisition Rate hero card
 *
 * Today page Tier 2. Shows FAR score, zone, momentum, and 6-week trend.
 * Gated by VITE_FEATURE_FAR env var.
 *
 * Spec: docs/TRIBOS_STATS_BIBLE.md §5.4
 * Acronym labeling: first mention is "FITNESS ACQUISITION RATE · FAR" (bible §9)
 */
import { Box, Text, Tooltip, Badge } from '@mantine/core';
import { classifyFARZone, getFARStatusLabel, FAR_ZONE_COLORS } from '../../../lib/metrics/farZones';
import { METRICS_TOOLTIPS } from '../../../lib/metrics/translate';
import { METRIC_DESCRIPTIONS } from '../../../lib/fitness/metricDescriptions';
import { FARTrendChart } from './FARTrendChart';
import type { FARZone } from '../../../lib/metrics/types';

interface FARData {
  score: number | null;
  score_7d: number | null;
  zone: FARZone | null;
  personal_ceiling_weekly_rate: number;
  personal_ceiling_basis: string;
  confidence: number;
  gap_days_in_window: number;
  momentum_flag: 'accelerating' | 'steady' | 'decelerating';
  tfi_delta_28d: number | null;
  weekly_rate: number | null;
  trend_6w: Array<{ date: string; far: number | null }>;
  computed_at: string;
}

interface Props {
  far: FARData | null;
  loading?: boolean;
  farDaysRemaining?: number;
}

const MOMENTUM_SYMBOLS = {
  accelerating: '↑',
  steady: '→',
  decelerating: '↓',
} as const;

function displayScore(score: number): string {
  if (score > 150) return '>150';
  if (score < -50) return '<−50';
  return String(Math.round(score));
}

function scoreColor(zone: FARZone | null): string {
  if (!zone) return 'var(--color-text-muted)';
  return FAR_ZONE_COLORS[zone];
}

export function FARCard({ far, loading, farDaysRemaining = 0 }: Props) {
  // Feature flag gate — VITE_FEATURE_FAR must be "true" to render
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(import.meta as any).env?.VITE_FEATURE_FAR) return null;

  if (loading) {
    return (
      <Box style={cardStyle}>
        <div style={{ height: 80 }} />
      </Box>
    );
  }

  // No data yet — cold start or no sync
  if (!far || far.score == null) {
    const daysMsg = farDaysRemaining > 0
      ? `Fitness Acquisition Rate available in ${farDaysRemaining} more days of synced training.`
      : 'Rebuilding baseline — Fitness Acquisition Rate available after consistent sync.';

    return (
      <Box style={cardStyle}>
        <FullNameHeader />
        <Text style={emptyTextStyle}>{daysMsg}</Text>
      </Box>
    );
  }

  const zone = far.zone ?? classifyFARZone(far.score);
  const isExtreme = far.score > 150 || far.score < -50;
  const scoreStr = displayScore(far.score);
  const statusLabel = getFARStatusLabel(far.score, far.personal_ceiling_weekly_rate, far.gap_days_in_window);
  const color = scoreColor(zone);

  // Gap treatment determines hero color override (spec §5.4 gap handling)
  const showAsGray = far.confidence < 0.6 && far.gap_days_in_window >= 6;
  const heroColor = showAsGray ? 'var(--color-text-muted)' : color;

  return (
    <Box style={cardStyle}>
      <FullNameHeader />

      {/* Gap warnings */}
      {far.gap_days_in_window >= 6 && far.gap_days_in_window < 14 && (
        <Text style={{ ...warningTextStyle, marginBottom: 8 }}>
          Data incomplete — FAR may be stale ({far.gap_days_in_window} days without sync)
        </Text>
      )}
      {far.gap_days_in_window >= 3 && far.gap_days_in_window < 6 && (
        <Text style={{ ...cautionTextStyle, marginBottom: 4 }}>
          Based on partial data:
        </Text>
      )}

      {/* Hero score */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <Tooltip
          label={METRICS_TOOLTIPS.far(far.score)}
          multiline
          w={280}
          withArrow
          position="top"
          styles={{ tooltip: tooltipStyle }}
        >
          <Text style={{ ...heroScoreStyle, color: heroColor }}>
            {scoreStr}
          </Text>
        </Tooltip>

        {/* Extreme value warning flag */}
        {isExtreme && (
          <Badge size="xs" color="orange" variant="outline">
            extreme
          </Badge>
        )}
      </div>

      {/* Zone label */}
      <Text style={{ ...zoneLabelStyle, color: heroColor }}>
        {statusLabel}
      </Text>

      {/* Momentum chip */}
      <Text style={momentumStyle}>
        {MOMENTUM_SYMBOLS[far.momentum_flag]} {far.momentum_flag.toUpperCase()}
      </Text>

      {/* 6-week trend chart */}
      {far.trend_6w && far.trend_6w.length > 1 && (
        <FARTrendChart trend={far.trend_6w} score7d={far.score_7d} />
      )}

      {/* Ceiling info (Phase 1: universal) */}
      <Text style={ceilingStyle}>
        Ceiling: {far.personal_ceiling_weekly_rate.toFixed(1)} TFI/wk
        {far.personal_ceiling_basis === 'universal' ? ' (universal)' : ''}
      </Text>
    </Box>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FullNameHeader() {
  return (
    <>
      <Text style={fullNameStyle}>
        {METRIC_DESCRIPTIONS.FAR.full.toUpperCase()}
      </Text>
      <Text style={acronymStyle}>
        FAR
        <span style={{ fontSize: 11, letterSpacing: '1px', marginLeft: 6, fontWeight: 600 }}>
          28-day
        </span>
      </Text>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  padding: '16px 20px',
  border: '0.5px solid var(--color-border)',
  backgroundColor: 'var(--color-card)',
  borderRadius: 0,
};

const fullNameStyle: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: 11, fontWeight: 600, letterSpacing: '1.5px',
  textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
  marginBottom: 2,
};

const acronymStyle: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: 14, fontWeight: 700, letterSpacing: '2px',
  textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
  marginBottom: 4,
};

const heroScoreStyle: React.CSSProperties = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 36, fontWeight: 700,
  lineHeight: 1.1,
  cursor: 'help',
};

const zoneLabelStyle: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: 14, fontWeight: 700, letterSpacing: '1.5px',
  textTransform: 'uppercase',
  marginTop: 2,
};

const momentumStyle: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: 11, fontWeight: 600, letterSpacing: '1px',
  color: 'var(--color-text-muted)',
  marginTop: 4,
};

const ceilingStyle: React.CSSProperties = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 11,
  color: 'var(--color-text-muted)',
  marginTop: 8,
};

const emptyTextStyle: React.CSSProperties = {
  fontFamily: "'Barlow', sans-serif",
  fontSize: 14,
  color: 'var(--color-text-muted)',
  lineHeight: 1.5,
  marginTop: 8,
};

const warningTextStyle: React.CSSProperties = {
  fontFamily: "'Barlow', sans-serif",
  fontSize: 12,
  color: 'var(--tribos-orange)',
  lineHeight: 1.4,
};

const cautionTextStyle: React.CSSProperties = {
  fontFamily: "'Barlow', sans-serif",
  fontSize: 12,
  color: 'var(--color-text-muted)',
  lineHeight: 1.4,
};

const tooltipStyle: React.CSSProperties = {
  fontSize: 13, lineHeight: 1.5, padding: '10px 14px',
  backgroundColor: 'var(--color-card)',
  color: 'var(--color-text-secondary)',
  border: '1px solid var(--color-border)',
};
