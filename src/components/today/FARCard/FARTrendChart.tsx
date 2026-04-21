/**
 * FARTrendChart — 6-week FAR sparkline with zone bands
 * Used inside FARCard on the TODAY page.
 */
import { ResponsiveContainer, LineChart, Line, ReferenceLine, Tooltip as RTooltip, YAxis } from 'recharts';
import { FAR_ZONE_COLORS } from '../../../lib/metrics/farZones';

interface TrendPoint {
  date: string;
  far: number | null;
}

interface Props {
  trend: TrendPoint[];
  score7d: number | null;
}

export function FARTrendChart({ trend, score7d }: Props) {
  if (!trend || trend.length === 0) return null;

  // Filter out suppressed (null) days for the line — recharts skips nulls with connectNulls=false
  const data = trend.map(p => ({ date: p.date, far: p.far }));

  return (
    <div style={{ width: '100%', height: 64, marginTop: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <YAxis domain={['auto', 'auto']} hide />

          {/* Zone boundary reference lines */}
          <ReferenceLine y={0}   stroke={FAR_ZONE_COLORS.maintaining} strokeDasharray="3 3" strokeOpacity={0.5} />
          <ReferenceLine y={40}  stroke={FAR_ZONE_COLORS.building}    strokeDasharray="3 3" strokeOpacity={0.4} />
          <ReferenceLine y={100} stroke={FAR_ZONE_COLORS.overreaching} strokeDasharray="3 3" strokeOpacity={0.4} />
          <ReferenceLine y={130} stroke={FAR_ZONE_COLORS.danger}       strokeDasharray="3 3" strokeOpacity={0.4} />

          {/* 7-day momentum as a dashed secondary line at constant y (visual indicator) */}
          {score7d != null && (
            <ReferenceLine
              y={score7d}
              stroke="var(--tribos-teal)"
              strokeDasharray="2 4"
              strokeOpacity={0.5}
              strokeWidth={1}
            />
          )}

          <RTooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length || payload[0].value == null) return null;
              return (
                <div style={{
                  background: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  padding: '4px 8px',
                  fontSize: 12,
                  fontFamily: "'DM Mono', monospace",
                  color: 'var(--color-text-primary)',
                }}>
                  FAR {Math.round(payload[0].value as number)}
                </div>
              );
            }}
          />

          <Line
            type="monotone"
            dataKey="far"
            stroke="var(--tribos-teal)"
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
