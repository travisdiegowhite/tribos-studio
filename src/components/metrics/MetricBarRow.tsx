/**
 * MetricBarRow — Reusable sub-score horizontal bar
 *
 * Used in both dashboard metric detail views and calculator components.
 */

interface Props {
  label: string;
  value: number;
  maxValue?: number;
  displayValue: string;
  color: string;
}

export function MetricBarRow({ label, value, maxValue = 1.0, displayValue, color }: Props) {
  const pct = Math.min(100, Math.max(0, (value / maxValue) * 100));

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 12, marginBottom: 4,
      }}>
        <span style={{
          color: 'var(--color-text-muted)',
          fontFamily: "'Barlow', sans-serif",
        }}>{label}</span>
        <span style={{
          color: 'var(--color-text-primary)',
          fontFamily: "'DM Mono', monospace",
          fontWeight: 500,
        }}>{displayValue}</span>
      </div>
      <div style={{
        height: 6, background: 'var(--color-border)',
        borderRadius: 3,
      }}>
        <div style={{
          height: 6, borderRadius: 3, background: color,
          width: `${pct}%`, transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}
