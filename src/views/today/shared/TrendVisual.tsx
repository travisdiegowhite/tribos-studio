interface Props {
  direction: 'up' | 'flat' | 'down';
  sparkline: number[];
}

/**
 * TREND visual — small directional arrow plus a thin gradient line from
 * gray to teal. The gradient is the only allowed gradient in the Today
 * view per the spec's brand rules.
 */
export function TrendVisual({ direction, sparkline }: Props) {
  const arrow = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→';
  const arrowColor =
    direction === 'up'
      ? 'var(--color-teal)'
      : direction === 'down'
        ? 'var(--color-orange)'
        : 'var(--tribos-neutral-gray)';

  // Render a tiny SVG sparkline if we have at least 2 points.
  const sparklineSvg = (() => {
    if (!sparkline || sparkline.length < 2) return null;
    const w = 80;
    const h = 16;
    const min = Math.min(...sparkline);
    const max = Math.max(...sparkline);
    const span = max - min || 1;
    const stride = w / (sparkline.length - 1);
    const points = sparkline
      .map((v, i) => {
        const x = i * stride;
        const y = h - ((v - min) / span) * h;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
        <defs>
          <linearGradient id="trendGrad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--tribos-neutral-gray)" />
            <stop offset="100%" stopColor="var(--color-teal)" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke="url(#trendGrad)"
          strokeWidth={1.5}
          points={points}
        />
      </svg>
    );
  })();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 16 }}>
      <span style={{ fontSize: 18, lineHeight: 1, color: arrowColor, fontWeight: 600 }}>{arrow}</span>
      {sparklineSvg}
    </div>
  );
}
