import { useMemo, useState, type ReactElement } from 'react';
import { Group, Paper, Stack, Text } from '@mantine/core';
import { useElementSize, useMediaQuery } from '@mantine/hooks';
import type { BikeHistory, RideBucket, WearSeries } from '../../lib/gear/wearSeries';
import { formatWhole } from '../../lib/gear/wearSeries';
import { FONT, SURFACE_COLOR, levelColor, monoCaption } from './garageTokens';
import { trackGear } from '../../utils/gearTelemetry';

interface WearTimelineProps {
  history: BikeHistory;
  useImperial: boolean;
}

const ROW_H = 46;
const ROW_H_COMPACT = 40;
const ROW_GAP = 10;
const STRIP_H = 64;
const STRIP_H_COMPACT = 56;

/**
 * "Wear over time, and the rides that did it."
 *
 * Small multiples: one row per part life, cumulative effective wear as a
 * step line with the replace threshold dashed, install/replace as dots.
 * Under the rows, the ride strip on the SAME x scale: one bar per bucket,
 * stacked road / gravel / trainer, wet miles hatched. Hand-drawn SVG from
 * the assembler's output; the hover tooltip is a Mantine Paper.
 */
export function WearTimeline({ history, useImperial }: WearTimelineProps) {
  const compact = useMediaQuery('(max-width: 768px)');
  const { ref, width: measured } = useElementSize();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverSent, setHoverSent] = useState(false);

  const labelW = compact ? 0 : 104;
  const valueW = compact ? 0 : 120;
  const totalW = Math.max(280, measured || 0);
  const plotW = Math.max(120, totalW - labelW - valueW);
  const rowH = compact ? ROW_H_COMPACT : ROW_H;
  const stripH = compact ? STRIP_H_COMPACT : STRIP_H;

  const { domain, rideStrip } = history;
  const series = useMemo(() => history.wearSeries.filter((s) => s.points.length > 0 || s.startM > 0 || s.current), [history.wearSeries]);
  const xOf = (t: number) => labelW + ((t - domain.startT) / (domain.endT - domain.startT)) * plotW;

  const months = useMemo(() => {
    const out: { label: string; t: number }[] = [];
    const d = new Date(domain.startT);
    d.setDate(1);
    if (d.getTime() < domain.startT) d.setMonth(d.getMonth() + 1);
    while (d.getTime() < domain.endT) {
      out.push({ label: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(), t: d.getTime() });
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }, [domain.startT, domain.endT]);

  const rowsH = series.length * (rowH + ROW_GAP);
  const stripTop = rowsH + 6;
  const axisY = stripTop + stripH + 16;
  const totalH = axisY + 8;

  const maxBucket = Math.max(1, ...rideStrip.map((b) => b.distanceM));
  const bucketMs = domain.bucket === 'day' ? 86_400_000 : 7 * 86_400_000;
  const bw = (bucketMs / (domain.endT - domain.startT)) * plotW;
  const hOf = (m: number) => (m / maxBucket) * (stripH - 4);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - labelW;
    if (x < 0 || x > plotW) { setHoverIdx(null); return; }
    const t = domain.startT + (x / plotW) * (domain.endT - domain.startT);
    let idx = rideStrip.findIndex((b) => t >= b.t && t < b.t + bucketMs);
    if (idx < 0) idx = rideStrip.length - 1;
    setHoverIdx(idx);
    if (!hoverSent) { setHoverSent(true); trackGear('bike_wear_chart_hovered', { bucket: domain.bucket }); }
  };

  const hovered: RideBucket | null = hoverIdx !== null ? rideStrip[hoverIdx] : null;
  const unit = useImperial ? 'mi' : 'km';

  if (series.length === 0 && rideStrip.every((b) => b.distanceM === 0)) {
    return (
      <Text size="sm" c="dimmed">
        No rides on this bike in the last year, so there is nothing to draw yet. Rides land here as they sync.
      </Text>
    );
  }

  return (
    <Stack gap={8} ref={ref} style={{ position: 'relative' }}>
      <svg
        width={totalW}
        height={totalH}
        viewBox={`0 0 ${totalW} ${totalH}`}
        style={{ display: 'block', maxWidth: '100%', cursor: 'crosshair' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="Wear over time per part, with the rides underneath"
      >
        <defs>
          <pattern id="garage-wet" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-text-primary)" strokeWidth="1.6" opacity="0.55" />
          </pattern>
        </defs>

        {/* Part rows */}
        {series.map((s, i) => {
          const top = i * (rowH + ROW_GAP);
          return <SeriesRow key={s.componentId} s={s} top={top} rowH={rowH} labelW={labelW} plotW={plotW} xOf={xOf} months={months} compact={compact} useImperial={useImperial} />;
        })}

        {/* Ride strip */}
        {months.map((m) => (
          <line key={`g-${m.t}`} x1={xOf(m.t)} y1={stripTop} x2={xOf(m.t)} y2={stripTop + stripH} stroke="var(--color-border)" strokeWidth={1} opacity={0.7} />
        ))}
        <line x1={labelW} y1={stripTop + stripH} x2={labelW + plotW} y2={stripTop + stripH} stroke="var(--color-border)" strokeWidth={1} />
        {rideStrip.map((b, i) => {
          if (b.distanceM <= 0) return null;
          const bx = xOf(b.t) + 1;
          const bwid = Math.max(2, bw - 2);
          let cursor = stripTop + stripH;
          const rects: ReactElement[] = [];
          const seg = (m: number, fill: string, key: string, opacity = 1) => {
            if (m <= 0) return;
            const hh = hOf(m);
            cursor -= hh;
            rects.push(<rect key={key} x={bx} y={cursor} width={bwid} height={Math.max(0, hh - 1.5)} fill={fill} opacity={opacity} />);
          };
          seg(b.bySurface.indoor, SURFACE_COLOR.indoor, 'i', 0.55);
          seg(b.bySurface.offroad, SURFACE_COLOR.offroad, 'o');
          seg(b.bySurface.road, SURFACE_COLOR.road, 'r');
          if (b.wetM > 0) rects.push(<rect key="w" x={bx} y={cursor} width={bwid} height={Math.max(0, hOf(b.wetM) - 1.5)} fill="url(#garage-wet)" />);
          const isHover = hoverIdx === i;
          return (
            <g key={b.key} opacity={hoverIdx === null || isHover ? 1 : 0.55}>
              {rects}
            </g>
          );
        })}
        {hovered && (
          <line x1={xOf(hovered.t) + bw / 2} y1={0} x2={xOf(hovered.t) + bw / 2} y2={stripTop + stripH} stroke="var(--color-text-muted)" strokeWidth={1} strokeDasharray="3 3" />
        )}
        <text x={compact ? labelW + 4 : labelW - 12} y={stripTop + (compact ? 12 : 14)} textAnchor={compact ? 'start' : 'end'} fontFamily={FONT.mono} fontSize={compact ? 10 : 11} letterSpacing={1} fill="var(--color-text-secondary)">RIDES</text>

        {/* Axis */}
        {months.map((m) => (
          <text key={`a-${m.t}`} x={xOf(m.t)} y={axisY} fontFamily={FONT.mono} fontSize={9} letterSpacing={1} fill="var(--color-text-muted)">{m.label}</text>
        ))}
      </svg>

      {hovered && (
        <Paper
          p="xs"
          withBorder
          radius={0}
          style={{
            position: 'absolute', top: 0, pointerEvents: 'none', zIndex: 2,
            left: Math.min(Math.max(0, xOf(hovered.t) - 90), Math.max(0, totalW - 200)),
            backgroundColor: 'var(--color-bg-secondary)', minWidth: 180,
          }}
        >
          <Text style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '1px', color: 'var(--color-text-muted)' }}>
            {domain.bucket === 'week' ? 'WEEK OF ' : ''}{new Date(hovered.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}
          </Text>
          <Text size="sm" style={{ fontFamily: FONT.body }}>
            {hovered.distanceM > 0 ? `${formatWhole(hovered.distanceM, useImperial)} ${unit} · ${hovered.rideIds.length} ride${hovered.rideIds.length === 1 ? '' : 's'}` : 'No rides'}
          </Text>
          {hovered.distanceM > 0 && (
            <Text style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '1px', color: 'var(--color-text-secondary)' }}>
              {[
                hovered.bySurface.road > 0 ? `road ${formatWhole(hovered.bySurface.road, useImperial)}` : null,
                hovered.bySurface.offroad > 0 ? `gravel ${formatWhole(hovered.bySurface.offroad, useImperial)}` : null,
                hovered.bySurface.indoor > 0 ? `trainer ${formatWhole(hovered.bySurface.indoor, useImperial)}` : null,
                hovered.wetM > 0 ? `wet ${formatWhole(hovered.wetM, useImperial)}` : null,
              ].filter(Boolean).join(' · ').toUpperCase()}
            </Text>
          )}
          {series.map((s) => {
            const at = wearAt(s, hovered.t + bucketMs);
            if (at === null) return null;
            return (
              <Text key={s.componentId} style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '1px', color: levelColor(s.level) }}>
                {s.label.toUpperCase()} {formatWhole(at, useImperial)}{s.replaceM ? ` / ${formatWhole(s.replaceM, useImperial)}` : ''}
              </Text>
            );
          })}
        </Paper>
      )}

      <Group gap={14} wrap="wrap" style={monoCaption}>
        <LegendSwatch color={SURFACE_COLOR.road} label="road" />
        <LegendSwatch color={SURFACE_COLOR.offroad} label="gravel" />
        <LegendSwatch color={SURFACE_COLOR.indoor} label="trainer" opacity={0.55} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: 'var(--color-teal)', backgroundImage: 'repeating-linear-gradient(45deg, var(--color-text-primary) 0 1px, transparent 1px 4px)', display: 'inline-block' }} />wet
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, borderTop: '1px dashed var(--color-text-muted)', display: 'inline-block' }} />replace line</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, border: '1.5px solid var(--color-text-primary)', display: 'inline-block' }} />installed</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--color-text-primary)', display: 'inline-block' }} />replaced</span>
      </Group>
      {history.isLowerBound && (
        <Text style={monoCaption}>weather isn&rsquo;t stamped on rides yet, so wet miles here are a floor</Text>
      )}
    </Stack>
  );
}

function LegendSwatch({ color, label, opacity = 1 }: { color: string; label: string; opacity?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, background: color, opacity, display: 'inline-block' }} />{label}
    </span>
  );
}

/** Cumulative wear of a series at time t (step-after), or null if t is outside its life. */
function wearAt(s: WearSeries, t: number): number | null {
  if (t < s.startT) return null;
  if (s.endT !== null && t > s.endT) return null;
  let v = s.startM;
  for (const p of s.points) { if (p.t <= t) v = p.cumM; else break; }
  return v;
}

interface SeriesRowProps {
  s: WearSeries; top: number; rowH: number; labelW: number; plotW: number;
  xOf: (t: number) => number; months: { label: string; t: number }[]; compact: boolean; useImperial: boolean;
}

function SeriesRow({ s, top, rowH, labelW, plotW, xOf, months, compact, useImperial }: SeriesRowProps) {
  const color = s.current ? levelColor(s.level) : 'var(--color-text-muted)';
  const endValue = s.points.length ? s.points[s.points.length - 1].cumM : s.startM;
  const ymax = Math.max((s.replaceM ?? endValue) * (compact ? 1.75 : 1.3), endValue) * 1.02 || 1;
  const yOf = (v: number) => top + rowH - (v / ymax) * (rowH - 4);
  const endX = xOf(s.endT ?? Number.MAX_SAFE_INTEGER);
  const clampX = (x: number) => Math.min(labelW + plotW, Math.max(labelW, x));

  // Step path from startT at startM through each point; hold to end of life.
  let d = `M ${clampX(xOf(s.startT)).toFixed(1)} ${yOf(s.startM).toFixed(1)}`;
  let lastX = clampX(xOf(s.startT));
  for (const p of s.points) {
    const px = clampX(xOf(p.t));
    d += ` H ${px.toFixed(1)} V ${yOf(p.cumM).toFixed(1)}`;
    lastX = px;
  }
  const finalX = clampX(s.endT !== null ? endX : labelW + plotW);
  if (finalX > lastX) d += ` H ${finalX.toFixed(1)}`;
  const area = `${d} V ${yOf(0).toFixed(1)} H ${clampX(xOf(s.startT)).toFixed(1)} Z`;

  return (
    <g>
      {months.map((m) => (
        <line key={`g-${m.t}`} x1={xOf(m.t)} y1={top} x2={xOf(m.t)} y2={top + rowH} stroke="var(--color-border)" strokeWidth={1} opacity={0.7} />
      ))}
      {s.replaceM && (
        <line x1={labelW} y1={yOf(s.replaceM)} x2={labelW + plotW} y2={yOf(s.replaceM)} stroke="var(--color-text-muted)" strokeWidth={1} strokeDasharray="4 4" />
      )}
      <line x1={labelW} y1={top + rowH} x2={labelW + plotW} y2={top + rowH} stroke="var(--color-border)" strokeWidth={1} />
      <path d={area} fill={color} opacity={s.current ? 0.12 : 0.06} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {s.events.map((e) => (
        e.kind === 'install'
          ? <circle key={`e-${e.t}`} cx={clampX(xOf(e.t))} cy={yOf(0)} r={4} fill="var(--color-card)" stroke="var(--color-text-primary)" strokeWidth={1.5} />
          : <circle key={`e-${e.t}`} cx={clampX(xOf(e.t))} cy={yOf(endValue)} r={4} fill="var(--color-text-primary)" stroke="var(--color-card)" strokeWidth={1.5} />
      ))}
      {compact ? (
        <>
          <text x={labelW + 4} y={top + 12} fontFamily={FONT.mono} fontSize={10} letterSpacing={1} fill="var(--color-text-secondary)">{s.label.toUpperCase()}</text>
          <text x={labelW + plotW - 4} y={top + 12} textAnchor="end" fontFamily={FONT.display} fontSize={12} fontWeight={600} fill={color}>
            {formatWhole(endValue, useImperial)}{s.replaceM ? ` / ${formatWhole(s.replaceM, useImperial)}` : ''}
          </text>
        </>
      ) : (
        <>
          <text x={labelW - 12} y={top + 14} textAnchor="end" fontFamily={FONT.mono} fontSize={11} letterSpacing={1} fill="var(--color-text-secondary)">{s.label.toUpperCase()}</text>
          <text x={labelW + plotW + 12} y={top + 14} fontFamily={FONT.display} fontSize={13} fontWeight={600} fill={color}>
            {formatWhole(endValue, useImperial)}{s.replaceM ? ` / ${formatWhole(s.replaceM, useImperial)}` : ''}
          </text>
        </>
      )}
    </g>
  );
}
