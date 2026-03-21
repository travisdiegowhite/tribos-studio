/**
 * MetricScoreBadge — Reusable score chip with color coding
 *
 * Used in both dashboard metric display and calculator components.
 * Score colors follow Tribos accent palette per spec.
 */
import { SCORE_COLORS, scoreBand } from '../../lib/metrics/types';

interface Props {
  label: string;
  score: number;
  size?: 'sm' | 'lg';
}

export function MetricScoreBadge({ label, score, size = 'sm' }: Props) {
  const band = scoreBand(score);
  const color = SCORE_COLORS[band];
  const isLg = size === 'lg';

  return (
    <div style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', background: color.bg, color: color.text,
      borderRadius: 0, padding: isLg ? '16px 20px' : '8px 12px',
      minWidth: isLg ? 100 : 64,
    }}>
      <span style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: isLg ? 11 : 10, letterSpacing: '0.5px',
        textTransform: 'uppercase', opacity: 0.8, fontWeight: 700,
      }}>{label}</span>
      <span style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: isLg ? 40 : 24, fontWeight: 500, lineHeight: 1,
      }}>{Math.round(score)}</span>
    </div>
  );
}
