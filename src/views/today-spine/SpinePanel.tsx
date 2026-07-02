/**
 * SpinePanel — Zone 02. The full-width SVG training-arc chart (past CTL line +
 * area, daily TSS bars, dashed future projection, planned peak, goal-event flag)
 * with the fitness node (Zone 01) absolutely positioned on top as the scrub
 * marker. Pointer-down anywhere on the chart scrubs the selected day; the node
 * body swallows the event so clicking it flips instead.
 */

import { useCallback, useMemo, useRef } from 'react';
import { Box, Group, Text } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { buildChart, selectionGeometry, svgXToIndex, SPINE_VIEW, type DayGeom } from './spineGeometry';
import { FitnessNode } from './FitnessNode';
import type { NodeVM } from './nodeView';
import { C, CHART, FONT, GRIDLINE_XS } from './tokens';
import type { SpineData } from './types';

const BASELINE_Y = 188;

interface SpinePanelProps {
  data: SpineData;
  selectedIndex: number;
  onSelect: (index: number) => void;
  vm: NodeVM;
  showNode?: boolean;
  /** Scrub/keyboard selection. On mobile the node hides but taps still select. */
  interactive?: boolean;
  dispTSB: number;
  dispReady: number;
  flipped: boolean;
  ringHover: boolean;
  onToggleFlip: () => void;
  onSnapToday: (e: React.MouseEvent) => void;
  onRingEnter: () => void;
  onRingLeave: () => void;
  onRingToggle: () => void;
}

/** Short, article-stripped event name for the coral flag (e.g. "The Rad" → "RAD"). */
function eventShortLabel(name: string): string {
  return name.replace(/^(the|a|an)\s+/i, '').trim().slice(0, 6).toUpperCase() || 'GOAL';
}

function LegendKey({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {swatch}
      {label}
    </span>
  );
}

export function SpinePanel({
  data,
  selectedIndex,
  onSelect,
  vm,
  showNode = true,
  interactive = true,
  dispTSB,
  dispReady,
  flipped,
  ringHover,
  onToggleFlip,
  onSnapToday,
  onRingEnter,
  onRingLeave,
  onRingToggle,
}: SpinePanelProps) {
  const spineRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const goToGoals = useCallback(() => navigate('/training'), [navigate]);
  const { days, todayIndex, event } = data;
  const futureDays = days.length - todayIndex - 1;
  const futureWeeks = Math.max(1, Math.round(futureDays / 7));

  const chart = useMemo(() => {
    const geom: DayGeom[] = days.map((d) => ({
      index: d.index,
      tfi: d.tfi,
      afi: d.afi,
      rss: d.rss,
      isFuture: d.isFuture,
      planned: d.planned,
    }));
    return buildChart(
      geom,
      todayIndex,
      event ? { date: event.date } : null,
      days.map((d) => d.date),
    );
  }, [days, todayIndex, event]);

  const selDay = days[selectedIndex] ?? days[todayIndex];
  const sel = selectionGeometry(selectedIndex, selDay, todayIndex, chart.scale, futureDays);
  const lastIndex = days.length - 1;

  const scrub = useCallback(
    (clientX: number) => {
      const el = spineRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const svgX = ((clientX - r.left) / r.width) * SPINE_VIEW.w;
      onSelect(svgXToIndex(svgX, todayIndex, futureDays));
    },
    [onSelect, todayIndex, futureDays],
  );

  const onScrubDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive) return;
      scrub(e.clientX);
      const mv = (ev: PointerEvent) => scrub(ev.clientX);
      const up = () => {
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
    },
    [scrub, interactive],
  );

  const onScrubKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (!interactive) return;
      let next: number | null = null;
      if (e.key === 'ArrowLeft') next = Math.max(0, selectedIndex - 1);
      else if (e.key === 'ArrowRight') next = Math.min(lastIndex, selectedIndex + 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = lastIndex;
      else if (e.key === 't' || e.key === 'T') next = todayIndex;
      if (next !== null) {
        e.preventDefault();
        onSelect(next);
      }
    },
    [interactive, selectedIndex, lastIndex, todayIndex, onSelect],
  );

  return (
    <Box
      style={{
        background: C.card,
        border: `1.5px solid ${C.border}`,
        boxShadow: '0 1px 3px rgba(20,16,8,.07),0 4px 12px rgba(20,16,8,.05)',
      }}
    >
      {/* Panel header */}
      <Group justify="space-between" align="center" style={{ padding: '13px 18px 4px' }}>
        <Group gap={9} align="center">
          <Text style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 500, letterSpacing: '2px', color: C.text3 }}>
            02
          </Text>
          <span style={{ width: 5, height: 5, background: C.orange, display: 'inline-block' }} />
          <Text style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 500, letterSpacing: '2px', color: C.text }}>
            TRAINING ARC
          </Text>
        </Group>
        <Group
          gap={16}
          align="center"
          style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '1px', color: C.text3 }}
          visibleFrom="sm"
        >
          <LegendKey swatch={<span style={{ width: 16, height: 2, background: CHART.pastLine }} />} label="FITNESS · CTL" />
          <LegendKey swatch={<span style={{ width: 16, height: 0, borderTop: `2px dashed ${C.text3}` }} />} label="PROJECTED" />
          <LegendKey swatch={<span style={{ width: 10, height: 10, background: CHART.tssBar }} />} label="DAILY TSS" />
        </Group>
      </Group>

      <Box style={{ padding: '6px 18px 16px' }}>
        <style>{`.spine-scrub:focus-visible{outline:2px solid ${C.teal};outline-offset:2px}`}</style>
        <div
          ref={spineRef}
          className="spine-scrub"
          onPointerDown={onScrubDown}
          onKeyDown={onScrubKey}
          tabIndex={interactive ? 0 : -1}
          role="slider"
          aria-label="Training day"
          aria-valuemin={0}
          aria-valuemax={lastIndex}
          aria-valuenow={selectedIndex}
          aria-valuetext={selDay.dateLabel}
          style={{ position: 'relative', cursor: interactive ? 'ew-resize' : 'default', touchAction: 'none' }}
        >
          <svg viewBox={`0 0 ${SPINE_VIEW.w} ${SPINE_VIEW.h}`} width="100%" style={{ display: 'block' }} preserveAspectRatio="none">
            <defs>
              <linearGradient id="spine-ctlfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#141410" stopOpacity=".07" />
                <stop offset="1" stopColor="#141410" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* gridlines + baseline */}
            <g stroke={CHART.gridline} strokeWidth="1">
              {GRIDLINE_XS.map((x) => (
                <line key={x} x1={x} y1="14" x2={x} y2={BASELINE_Y} />
              ))}
            </g>
            <line x1="24" y1={BASELINE_Y} x2="1120" y2={BASELINE_Y} stroke={CHART.baseline} strokeWidth="1.5" />

            {/* selected week band */}
            <rect x={sel.bandX} y="14" width="14" height="174" fill="rgba(42,140,130,.09)" />

            {/* TSS bars */}
            {chart.bars.map((b, i) => (
              <rect
                key={i}
                x={b.x}
                y={b.y}
                width="8"
                height={b.h}
                fill={b.fill}
                stroke={b.stroke}
                strokeDasharray={b.dash}
              />
            ))}

            {/* CTL past area + line */}
            <path d={chart.pastArea} fill="url(#spine-ctlfill)" />
            <path d={chart.pastLine} fill="none" stroke={CHART.pastLine} strokeWidth="2.75" />

            {/* CTL future projection */}
            <path d={chart.futureLine} fill="none" stroke={CHART.futureLine} strokeWidth="2.5" strokeDasharray="5 4" />

            {/* past ride dots */}
            {chart.pastDots.map((p, i) => (
              <circle key={`pd${i}`} cx={p.x} cy={p.y} r="3" fill={CHART.pastLine} />
            ))}
            {/* planned future dots */}
            {chart.plannedDots.map((p, i) => (
              <circle key={`pl${i}`} cx={p.x} cy={p.y} r="4" fill={C.base} stroke={C.gold} strokeWidth="2" />
            ))}

            {/* peak marker */}
            {chart.peak && (
              <>
                <line x1={chart.peak.x} y1="20" x2={chart.peak.x} y2={BASELINE_Y} stroke={C.gold} strokeWidth="1.2" strokeDasharray="3 3" />
                <circle cx={chart.peak.x} cy={chart.peak.y} r="4.5" fill={C.gold} />
                <text x={chart.peak.labelX} y="30" style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 9, fill: C.gold, letterSpacing: '1px' }}>
                  PEAK
                </text>
              </>
            )}

            {/* event flag */}
            {chart.event && event && (
              <>
                <line x1={chart.event.x} y1="20" x2={chart.event.x} y2={BASELINE_Y} stroke={C.coral} strokeWidth="1.2" />
                <path d={`M${chart.event.x - 34},20 h34 v13 h-34 z`} fill={C.coral} />
                <text
                  x={chart.event.x - 31}
                  y="30"
                  style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 8, fill: '#fff', letterSpacing: '.5px' }}
                >
                  {eventShortLabel(event.name)}
                </text>
                {/* When the event is past the projection window, say how far. */}
                {chart.event.beyond && (
                  <text
                    x={chart.event.x - 3}
                    y="44"
                    textAnchor="end"
                    style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 8, fill: C.coral, letterSpacing: '.5px' }}
                  >
                    {chart.event.daysOut}d →
                  </text>
                )}
              </>
            )}

            {/* No goal set — ghost flag where the event would land. */}
            {!event && (
              <g
                onPointerDown={(e) => e.stopPropagation()}
                onClick={goToGoals}
                style={{ cursor: 'pointer' }}
                role="link"
                aria-label="Set a goal event"
              >
                <rect x="1004" y="20" width="76" height="14" fill="none" stroke={C.coral} strokeWidth="1" strokeDasharray="3 2" opacity=".65" />
                <text
                  x="1042"
                  y="30"
                  textAnchor="middle"
                  style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 8, fill: C.coral, letterSpacing: '.5px', opacity: 0.85 }}
                >
                  SET A GOAL →
                </text>
              </g>
            )}

            {/* selected highlight bar */}
            {sel.barShow && <rect x={sel.barX} y={sel.barY} width="8" height={sel.barH} fill={C.teal} opacity=".55" />}

            {/* selected marker line */}
            <line x1={sel.selX} y1="28" x2={sel.selX} y2={BASELINE_Y} stroke={C.teal} strokeWidth="1.6" strokeDasharray="4 3" />

            {/* date flag */}
            <rect x={sel.labelX} y="10" width="88" height="17" fill={C.teal} />
            <text x={sel.labelTX} y="22" textAnchor="middle" style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 9, fill: '#fff', letterSpacing: '1px' }}>
              {selDay.dateLabel}
            </text>

            {/* selected point dot */}
            <circle cx={sel.selX} cy={sel.selY} r="5.5" fill={C.teal} stroke="#fff" strokeWidth="2" />

            {/* axis labels */}
            <text x="40" y="208" style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 9, fill: CHART.axisMuted, letterSpacing: '1px' }}>
              6 WK AGO
            </text>
            <text x="380" y="208" style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 9, fill: CHART.axisMuted, letterSpacing: '1px' }}>
              PAST
            </text>
            <text x="880" y="208" style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 9, fill: CHART.axisFuture, letterSpacing: '1px' }}>
              NEXT {futureWeeks} WEEKS · PLANNED
            </text>
          </svg>

          {showNode && (
            <FitnessNode
              vm={vm}
              dispTSB={dispTSB}
              dispReady={dispReady}
              flipped={flipped}
              ringHover={ringHover}
              nodeLeftPct={sel.nodeLeftPct}
              onHeaderPointerDown={onScrubDown}
              onSnapToday={onSnapToday}
              onToggleFlip={onToggleFlip}
              onRingEnter={onRingEnter}
              onRingLeave={onRingLeave}
              onRingToggle={onRingToggle}
            />
          )}
        </div>

        <Text style={{ fontFamily: FONT.body, fontSize: 10.5, color: CHART.axisMuted, marginTop: 12, textAlign: 'center' }}>
          {showNode
            ? 'Drag the node to scrub past days or ahead into the plan · click it for the CTL/ATL trend · click the ring for readiness'
            : `Tap a day to inspect it — the last 6 weeks and the ${futureWeeks}-week projection ahead.`}
        </Text>
      </Box>
    </Box>
  );
}
