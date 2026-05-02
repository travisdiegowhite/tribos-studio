import type { PlanPhase, TrainingPhase } from '../../../types/training';

interface Props {
  phases: PlanPhase[];
  totalWeeks: number;
  currentWeek: number;
}

const PHASE_COLOR: Record<TrainingPhase, string> = {
  base: 'var(--color-teal)',
  build: 'var(--color-gold)',
  peak: 'var(--color-orange)',
  taper: 'var(--color-coral)',
  recovery: 'var(--tribos-neutral-gray)',
};

/**
 * Horizontal strip of plan phases, sized in proportion to each phase's week
 * count, with a marker at the current week's position across the entire
 * plan. Empty when `phases` is empty (renders an empty bar shell).
 */
export function PhaseStrip({ phases, totalWeeks, currentWeek }: Props) {
  if (!phases || phases.length === 0 || totalWeeks <= 0) {
    return (
      <div
        style={{ height: 8, width: '100%', background: 'var(--color-bg-secondary)' }}
      />
    );
  }

  const markerPct = Math.max(0, Math.min(100, ((currentWeek - 0.5) / totalWeeks) * 100));

  return (
    <div style={{ position: 'relative', height: 8, width: '100%', display: 'flex' }}>
      {phases.map((phase, idx) => {
        const weeks = Array.isArray(phase.weeks) ? phase.weeks.length : 0;
        const widthPct = totalWeeks > 0 ? (weeks / totalWeeks) * 100 : 0;
        return (
          <div
            key={`${phase.phase}-${idx}`}
            data-testid="phase-segment"
            style={{
              width: `${widthPct}%`,
              background: PHASE_COLOR[phase.phase],
              opacity: 0.85,
            }}
          />
        );
      })}
      <div
        data-testid="phase-marker"
        style={{
          position: 'absolute',
          top: -2,
          bottom: -2,
          left: `calc(${markerPct}% - 1px)`,
          width: 2,
          background: '#141410',
        }}
      />
    </div>
  );
}
