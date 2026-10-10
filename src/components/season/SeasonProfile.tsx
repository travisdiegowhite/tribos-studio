/**
 * The season as a ride: the year drawn as a course profile.
 *
 * The ridge is weekly hours — solid ink for weeks already ridden, dashed for
 * the plan. The ground under the planned ridge is coloured by phase (climb,
 * sharpen, descend…), races stand on the ridge as flags, and up to three
 * hand-lettered coach notes point at what matters. All positions come from
 * the engine's plan; layout decisions live in src/lib/season/view.ts.
 */

import { useEffect, useId, useMemo, useRef, type KeyboardEvent } from 'react';
import { Box } from '@mantine/core';
import { formatSeasonDate, type Phase, type SeasonPlan } from '../../lib/season/engine';
import {
  PHASE_LABEL,
  PRIORITY_ROLE,
  layoutFlags,
  monthMarks,
  pickNotes,
  seasonHoursSeries,
  smoothPath,
} from '../../lib/season/view';

// Geometry (SVG units; the drawing scales to its container).
const W = 1200;
const H = 380;
const X0 = 34;
const X1 = 1166;
const BASE = 318;
const TOP = 150;
const LABEL_ROW0 = 34;
const LABEL_ROW_GAP = 32;
const NOTE_FLOOR = 132; // notes stay below the flag label rows
/** Below this container width the profile scrolls sideways instead of shrinking. */
export const PROFILE_MIN_WIDTH = 900;

export const PHASE_FILL: Record<Phase, string> = {
  recover: 'var(--color-easy)',
  base: 'var(--color-border)',
  build: 'var(--color-signal)',
  peak: 'var(--color-ink)',
  taper: 'var(--color-highlight)',
};
export const PHASE_OPACITY: Record<Phase, number> = { recover: 0.35, base: 0.55, build: 0.55, peak: 0.45, taper: 0.8 };

interface Props {
  plan: SeasonPlan;
  ridden: Record<string, number>;
  /** Week containing today, or null when today is outside the season. */
  todayWeek: number | null;
  /** Today's position in weeks from the season start (fractional: Friday ≈ week + 0.6). */
  todayPos: number;
  selectedId: string | null;
  onSelect: (raceId: string) => void;
}

export default function SeasonProfile({ plan, ridden, todayWeek, todayPos, selectedId, onSelect }: Props) {
  const clipId = `season-ahead-${useId().replace(/:/g, '')}`;
  const scrollRef = useRef<HTMLDivElement>(null);
  const N = plan.weeks;
  const cw = (X1 - X0) / N;

  const drawing = useMemo(() => {
    const x = (week: number) => X0 + (week + 0.5) * cw;
    const hours = seasonHoursSeries(plan, ridden, todayWeek);
    const maxH = Math.max(12, Math.ceil(Math.max(...hours)) + 1);
    const y = (h: number) => BASE - (h / maxH) * (BASE - TOP);
    const pts = hours.map((h, w) => [x(w), y(h)] as [number, number]);
    const ridgeY = (week: number) => {
      const i = Math.max(0, Math.min(N - 1, Math.floor(week)));
      const j = Math.max(0, Math.min(N - 1, i + 1));
      return pts[i][1] + (pts[j][1] - pts[i][1]) * (week - Math.floor(week));
    };
    // Where ridden ends and the plan begins.
    const split = todayWeek ?? (todayPos < 0 ? 0 : N - 1);
    const past = pts.slice(0, split + 1);
    const ahead = pts.slice(split);
    const area = (p: [number, number][]) =>
      p.length < 2 ? '' : `${smoothPath(p)} L${p[p.length - 1][0].toFixed(1)},${BASE} L${p[0][0].toFixed(1)},${BASE} Z`;
    return {
      x,
      ridgeY,
      split,
      pastArea: area(past),
      aheadArea: area(ahead),
      aheadLine: ahead.length > 1 ? smoothPath(ahead) : '',
      flags: layoutFlags(plan, x, X1 + 30, 8.4),
      notes: pickNotes(plan, todayWeek),
      months: monthMarks(plan),
    };
  }, [plan, ridden, todayWeek, todayPos, N, cw]);

  // On a narrow screen, start scrolled so today sits near the left edge.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const frac = (X0 + Math.max(0, todayPos - 2) * cw) / W;
    el.scrollLeft = frac * el.scrollWidth;
  }, [todayPos, cw]);

  const { x, ridgeY, split, flags, notes, months } = drawing;
  const todayX = X0 + Math.max(0, Math.min(N, todayPos)) * cw;
  const showToday = todayPos >= 0 && todayPos <= N;

  const select = (id: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(id);
    }
  };

  return (
    <Box ref={scrollRef} style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Season profile: weekly hours drawn as a course, with races as flags"
        style={{ display: 'block', width: '100%', minWidth: PROFILE_MIN_WIDTH, height: 'auto' }}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={drawing.aheadArea} />
          </clipPath>
        </defs>

        {/* Terrain: phase colours under the planned ridge. */}
        <g clipPath={`url(#${clipId})`}>
          {plan.schedule.map((w) =>
            w.index < split ? null : (
              <rect
                key={w.index}
                x={X0 + w.index * cw}
                y={TOP - 60}
                width={cw + 0.6}
                height={BASE - TOP + 60}
                fill={PHASE_FILL[w.phase]}
                fillOpacity={PHASE_OPACITY[w.phase]}
              >
                <title>{`${PHASE_LABEL[w.phase]} · week of ${formatSeasonDate(w.startDate)} · ${w.targetHours} h`}</title>
              </rect>
            ),
          )}
        </g>

        {/* Ridden: inked in. Plan: a dashed ridge. */}
        {drawing.pastArea && <path d={drawing.pastArea} fill="var(--color-ink)" />}
        {drawing.aheadLine && (
          <path d={drawing.aheadLine} fill="none" stroke="var(--color-ink)" strokeWidth={2.5} strokeDasharray="7 5" strokeLinecap="round" />
        )}
        <line x1={X0} x2={X1} y1={BASE} y2={BASE} stroke="var(--color-ink)" strokeWidth={1.5} />
        {split >= 3 && (
          <text x={X0 + 10} y={BASE - 8} fill="var(--color-bg)" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            ridden
          </text>
        )}

        {/* Months. */}
        {months.map((m) => {
          const mx = X0 + m.week * cw;
          const year = plan.schedule[m.week].startDate.slice(2, 4);
          return (
            <g key={m.week}>
              <line x1={mx} x2={mx} y1={BASE} y2={BASE + 6} stroke="var(--color-text-muted)" />
              <text x={mx + 3} y={BASE + 22} fill="var(--color-text-muted)" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {m.label === 'Jan' ? `Jan '${year}` : m.label}
              </text>
            </g>
          );
        })}
        <text x={X0} y={BASE + 44} fill="var(--color-text-muted)" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {`Height = hours per week (${plan.typicalWeeklyHours} h typical)`}
        </text>

        {/* You are here. */}
        {showToday && (
          <g aria-hidden>
            <line x1={todayX} x2={todayX} y1={ridgeY(todayPos - 0.5) - 34} y2={BASE} stroke="var(--color-accent)" strokeWidth={2.5} />
            <circle cx={todayX} cy={ridgeY(todayPos - 0.5) - 40} r={6} fill="var(--color-accent)" />
            <text
              x={todayX + 10}
              y={ridgeY(todayPos - 0.5) - 36}
              fill="var(--color-accent)"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em' }}
            >
              YOU ARE HERE
            </text>
          </g>
        )}

        {/* Race flags. */}
        {flags.map((f) => {
          const fx = x(f.week);
          const ry = ridgeY(f.week);
          const top = LABEL_ROW0 + f.level * LABEL_ROW_GAP;
          const isGoal = f.lead.priority === 'A';
          const selected = f.races.some((r) => r.id === selectedId);
          const width = f.label.length * 8.4 + 24;
          return (
            <g
              key={f.week}
              role="button"
              tabIndex={0}
              aria-label={`${f.lead.name}, ${PRIORITY_ROLE[f.lead.priority]} race, ${formatSeasonDate(f.lead.date)}`}
              aria-pressed={selected}
              onClick={() => onSelect(f.lead.id)}
              onKeyDown={select(f.lead.id)}
              style={{ cursor: 'pointer', outline: 'none' }}
            >
              <line
                x1={fx}
                x2={fx}
                y1={ry}
                y2={top + 6}
                stroke={selected ? 'var(--color-accent)' : 'var(--color-ink)'}
                strokeWidth={isGoal || selected ? 2 : 1.2}
                strokeDasharray={isGoal || selected ? undefined : '2 3'}
              />
              {isGoal ? (
                <path d={`M${fx},${top - 12} l18,7 l-18,7 Z`} fill={selected ? 'var(--color-accent)' : 'var(--color-ink)'} />
              ) : (
                <rect
                  x={fx - 5}
                  y={top - 4}
                  width={10}
                  height={10}
                  transform={`rotate(45 ${fx} ${top + 1})`}
                  fill={f.conflict ? 'var(--color-signal)' : 'var(--color-bg)'}
                  stroke={selected ? 'var(--color-accent)' : f.conflict ? 'var(--color-signal)' : 'var(--color-ink)'}
                  strokeWidth={2}
                />
              )}
              <text
                x={f.flip ? fx - 8 : fx + (isGoal ? 22 : 10)}
                y={top + (isGoal ? 0 : 5)}
                textAnchor={f.flip ? 'end' : 'start'}
                fill={selected ? 'var(--color-accent)' : isGoal ? 'var(--color-ink)' : 'var(--color-text-secondary)'}
                textDecoration={selected ? 'underline' : undefined}
                style={
                  isGoal
                    ? { fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 17, textTransform: 'uppercase' }
                    : { fontFamily: 'var(--font-mono)', fontSize: 12 }
                }
              >
                {f.label}
              </text>
              {/* Generous hit area down the pole. */}
              <rect x={f.flip ? fx - width : fx - 8} y={top - 18} width={width + 10} height={Math.max(26, ry - top + 22)} fill="transparent" />
            </g>
          );
        })}

        {/* Coach notes: moments, not labels. */}
        {notes.map((n) => {
          const ax = x(n.week);
          const ay = ridgeY(n.week);
          if (n.kind === 'recover') {
            return (
              <text key={n.kind} x={ax - 22} y={BASE - 12} fill="var(--color-signal-text)" style={{ fontFamily: 'var(--font-hand)', fontSize: 21 }}>
                {n.text}
              </text>
            );
          }
          // Springboard notes sit left of their race; conflict notes to the right (flipped near the edge).
          const left = n.kind === 'springboard' || ax > X1 - 260;
          const ny = Math.max(NOTE_FLOOR, ay - 64);
          const nx = left ? ax - 24 : ax + 24;
          const end = left ? [ax - 6, ay - 4] : [ax + 4, ay - 8];
          return (
            <g key={n.kind}>
              <text
                x={nx}
                y={ny}
                textAnchor={left ? 'end' : 'start'}
                fill="var(--color-signal-text)"
                style={{ fontFamily: 'var(--font-hand)', fontSize: 21 }}
              >
                {n.text}
              </text>
              <path
                d={`M${nx + (left ? -6 : 6)},${ny + 6} Q${(nx + end[0]) / 2},${end[1] + 30} ${end[0]},${end[1]}`}
                fill="none"
                stroke="var(--color-signal-text)"
                strokeWidth={1.6}
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

/** The legend under the profile: ridden vs planned, the five phases, the two race marks. */
export function SeasonProfileLegend() {
  const item = { display: 'inline-flex', alignItems: 'center', gap: 6 } as const;
  return (
    <Box
      style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', fontSize: 13, color: 'var(--color-text-secondary)' }}
    >
      <span style={item}>
        <span style={{ width: 14, height: 14, background: 'var(--color-ink)' }} />
        Ridden
      </span>
      <span style={item}>
        <span style={{ width: 22, borderTop: '2.5px dashed var(--color-ink)' }} />
        Planned
      </span>
      {(['recover', 'base', 'build', 'peak', 'taper'] as Phase[]).map((p) => (
        <span key={p} style={item}>
          <span style={{ width: 14, height: 14, background: PHASE_FILL[p], opacity: Math.min(1, PHASE_OPACITY[p] + 0.25) }} />
          {PHASE_LABEL[p]}
        </span>
      ))}
      <span style={item}>
        <svg width="14" height="14" aria-hidden>
          <path d="M2,1 l11,6 l-11,6 Z" fill="var(--color-ink)" />
        </svg>
        {PRIORITY_ROLE.A} race
      </span>
      <span style={item}>
        <svg width="14" height="14" aria-hidden>
          <rect x="3" y="3" width="8" height="8" transform="rotate(45 7 7)" fill="var(--color-bg)" stroke="var(--color-ink)" strokeWidth="2" />
        </svg>
        {PRIORITY_ROLE.B} / {PRIORITY_ROLE.C}
      </span>
    </Box>
  );
}
