/**
 * ComfortStrip — the route as one horizontal bar from start to finish,
 * coloured by how each stretch sits against the rider's comfort level
 * (docs/ROUTING-LANDING-SPEC.md §2), with distance ticks. Flagged and
 * unmapped stretches are buttons: picking one asks the page to show that
 * slice on the map.
 *
 * Pure: takes a ComfortValidation (comfortValidator.ts). A null validation
 * is "not enough road data", never a pass.
 */
import { COMFORT_TONE_COLORS } from '../../utils/mapPalette';
import { toneRuns, type ComfortValidation, type SegmentTone } from '../../utils/comfortValidator';
import {
  COMFORT_STRIP_COPY,
  flaggedSummary,
  unknownSummary,
  withinLine,
} from './comfortStripCopy';

const M_PER_MI = 1609.344;
const M_PER_KM = 1000;

export interface ComfortStripProps {
  validation: ComfortValidation | null;
  /** True while the roads are still being fetched. */
  loading?: boolean;
  units?: 'mi' | 'km';
  onSelectStretch?: (start_m: number, end_m: number) => void;
  /** Hide the legend (tight layouts). */
  compact?: boolean;
}

/** Tick step in the display unit so there are at most ~6 ticks. */
function tickStep(totalUnits: number): number {
  for (const step of [1, 2, 5, 10, 20, 25, 50, 100]) {
    if (totalUnits / step <= 6) return step;
  }
  return 200;
}

const SELECTABLE: ReadonlySet<SegmentTone> = new Set(['flagged', 'unknown', 'blocked']);

export function ComfortStrip({
  validation,
  loading = false,
  units = 'mi',
  onSelectStretch,
  compact = false,
}: ComfortStripProps) {
  const textMuted = { color: 'var(--color-text-secondary, #5C5C70)', fontSize: 12 } as const;

  if (!validation) {
    return (
      <div data-testid="comfort-strip" data-state={loading ? 'loading' : 'no-data'} style={{ ...textMuted }}>
        {loading ? COMFORT_STRIP_COPY.checking : COMFORT_STRIP_COPY.noData}
      </div>
    );
  }

  const total_m = validation.total_m > 0 ? validation.total_m : 1;
  const runs = toneRuns(validation);
  const unitM = units === 'km' ? M_PER_KM : M_PER_MI;
  const totalUnits = total_m / unitM;
  const step = tickStep(totalUnits);
  const ticks: number[] = [];
  for (let u = step; u < totalUnits - step * 0.25; u += step) ticks.push(u);
  const flaggedCount = validation.flaggedStretches.length;
  const unknownLine = unknownSummary(validation.unknownPct);

  return (
    <div data-testid="comfort-strip" data-state="ready">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-ink, #0A0A14)' }}>
          {withinLine(validation.withinPct, validation.level)}
        </span>
        <span style={textMuted}>{flaggedSummary(flaggedCount)}</span>
      </div>

      <div
        role="group"
        aria-label={COMFORT_STRIP_COPY.title}
        style={{ position: 'relative', display: 'flex', height: 14, width: '100%', background: 'var(--color-sheet, #F3F3F6)' }}
      >
        {runs.map((run, i) => {
          const widthPct = ((run.end_m - run.start_m) / total_m) * 100;
          const color = COMFORT_TONE_COLORS[run.tone] ?? COMFORT_TONE_COLORS.unknown;
          const selectable = !!onSelectStretch && SELECTABLE.has(run.tone);
          const label = `${COMFORT_STRIP_COPY.legend[run.tone as keyof typeof COMFORT_STRIP_COPY.legend] ?? run.tone}, ${(
            run.start_m / unitM
          ).toFixed(1)}–${(run.end_m / unitM).toFixed(1)} ${units}`;
          const style = {
            width: `${widthPct}%`,
            minWidth: run.tone === 'flagged' ? 3 : 0,
            height: '100%',
            background: color,
            border: 'none',
            padding: 0,
            cursor: selectable ? 'pointer' : 'default',
          } as const;
          return selectable ? (
            <button
              key={i}
              type="button"
              data-tone={run.tone}
              aria-label={`${COMFORT_STRIP_COPY.showOnMap}: ${label}`}
              title={label}
              onClick={() => onSelectStretch?.(run.start_m, run.end_m)}
              style={style}
            />
          ) : (
            <span key={i} data-tone={run.tone} title={label} style={style} />
          );
        })}
      </div>

      <div aria-hidden style={{ position: 'relative', height: 14, marginTop: 2 }}>
        {ticks.map((u) => (
          <span
            key={u}
            style={{
              position: 'absolute',
              left: `${((u * unitM) / total_m) * 100}%`,
              transform: 'translateX(-50%)',
              fontFamily: 'var(--font-mono, "Courier Prime", monospace)',
              fontSize: 10,
              color: 'var(--color-text-secondary, #5C5C70)',
            }}
          >
            {u}
          </span>
        ))}
        <span style={{ position: 'absolute', right: 0, fontSize: 10, color: 'var(--color-text-secondary, #5C5C70)' }}>
          {units}
        </span>
      </div>

      {unknownLine && <div style={{ ...textMuted, marginTop: 4 }}>{unknownLine}</div>}

      {!compact && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 6 }}>
          {(['within', 'at', 'flagged', 'unknown'] as const).map((tone) => (
            <span key={tone} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...textMuted, fontSize: 11 }}>
              <span style={{ width: 10, height: 10, background: COMFORT_TONE_COLORS[tone], display: 'inline-block' }} />
              {COMFORT_STRIP_COPY.legend[tone]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default ComfortStrip;
