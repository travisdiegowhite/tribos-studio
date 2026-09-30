/**
 * FitnessNode — Zone 01. The floating frosted-glass card that sits on the spine
 * as the "today" marker and scrubs along it. Front = the form state in words
 * (sentence-first, FS as a quiet citation chip); back (on click) = the TFI/AFI
 * trend sparklines + week volume. The teal header doubles as the day's workout
 * chip and the drag handle.
 *
 * The frosted-glass fill + white text-shadow halos are intentional and tuned
 * (see docs/today-view) — kept verbatim so readouts stay legible over the curve.
 * On mobile the card renders `compact` (solid, non-floating, read-only).
 */

import { C, CHART, FONT } from './tokens';
import { MetricCitation } from '../../components/ui/MetricCitation';
import type { NodeVM } from './nodeView';

interface FitnessNodeProps {
  vm: NodeVM;
  flipped: boolean;
  nodeLeftPct?: string;
  compact?: boolean;
  onHeaderPointerDown?: (e: React.PointerEvent) => void;
  onSnapToday?: (e: React.MouseEvent) => void;
  onToggleFlip?: () => void;
}

const HALO_STRONG =
  '0 1px 3px var(--color-bg), 0 0 3px var(--color-bg), 0 0 6px color-mix(in srgb, var(--color-bg) 80%, transparent)';
const HALO_MED = '0 1px 2px var(--color-bg), 0 0 4px color-mix(in srgb, var(--color-bg) 85%, transparent)';
const HALO_SOFT = '0 1px 1px color-mix(in srgb, var(--color-bg) 85%, transparent)';

export function FitnessNode({
  vm,
  flipped,
  nodeLeftPct,
  compact = false,
  onHeaderPointerDown,
  onSnapToday,
  onToggleFlip,
}: FitnessNodeProps) {
  const fsLabel = `${vm.fs >= 0 ? '+' : ''}${Math.round(vm.fs)}`;

  const containerStyle: React.CSSProperties = compact
    ? {
        width: '100%',
        background: C.card,
        border: `1.5px solid ${C.teal}`,
        boxShadow: 'none',
      }
    : {
        position: 'absolute',
        left: nodeLeftPct,
        top: 52,
        transform: 'translateX(-50%)',
        width: 236,
        background: 'color-mix(in srgb, var(--color-bg) 18%, transparent)',
        backdropFilter: 'blur(6px) saturate(1.05)',
        WebkitBackdropFilter: 'blur(6px) saturate(1.05)',
        border: `1.5px solid ${C.teal}`,
        boxShadow: 'none',
      };

  return (
    <div style={containerStyle}>
      {/* Teal header — day's workout chip + drag handle. */}
      <div
        onPointerDown={compact ? undefined : onHeaderPointerDown}
        style={{
          padding: '7px 12px 8px',
          borderBottom: '1px solid color-mix(in srgb, var(--color-bg) 32%, transparent)',
          background: C.navy,
          cursor: compact ? 'default' : 'grab',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 8.5,
              fontWeight: 500,
              color: 'color-mix(in srgb, var(--color-bg) 88%, transparent)',
              whiteSpace: 'nowrap',
            }}
          >
            {vm.headerLabel}
          </span>
          {!vm.isToday && onSnapToday && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onSnapToday}
              style={{
                border: '1px solid color-mix(in srgb, var(--color-bg) 55%, transparent)',
                background: 'color-mix(in srgb, var(--color-bg) 16%, transparent)',
                color: 'var(--color-bg)',
                fontFamily: FONT.mono,
                fontSize: 8,
                fontWeight: 500,
                padding: '2px 7px',
                cursor: 'pointer',
              }}
            >
              {vm.isFuture ? '◂ Today' : 'Today ▸'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5 }}>
          <span
            style={{
              flex: 'none',
              fontFamily: FONT.mono,
              fontSize: 8,
              fontWeight: 500,
              color: vm.activity.tagColor,
              border: '1px solid color-mix(in srgb, var(--color-bg) 50%, transparent)',
              padding: '1px 5px',
            }}
          >
            {vm.activity.tag}
          </span>
          <span
            style={{
              minWidth: 0,
              fontFamily: FONT.body,
              fontWeight: 600,
              fontSize: 12.5,
              color: 'var(--color-bg)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {vm.activity.name}
          </span>
          <span
            style={{
              marginLeft: 'auto',
              flex: 'none',
              fontFamily: FONT.mono,
              fontSize: 9,
              color: 'color-mix(in srgb, var(--color-bg) 82%, transparent)',
            }}
          >
            {vm.activity.meta}
          </span>
        </div>
      </div>

      {/* Body — click (or Enter/Space) flips FRONT ↔ BACK. */}
      <div
        onPointerDown={compact ? undefined : (e) => e.stopPropagation()}
        onClick={compact ? undefined : onToggleFlip}
        onKeyDown={
          compact
            ? undefined
            : (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggleFlip?.();
                }
              }
        }
        role={compact ? undefined : 'button'}
        tabIndex={compact ? undefined : 0}
        aria-pressed={compact ? undefined : flipped}
        aria-label={compact ? undefined : 'Show fitness and fatigue trend'}
        style={{ cursor: compact ? 'default' : 'pointer', position: 'relative' }}
      >
        {!flipped ? (
          <div style={{ padding: '11px 12px 9px' }}>
            <div
              style={{
                fontFamily: FONT.mono,
                fontSize: 9,
                fontWeight: 500,
                color: C.text2,
                textShadow: HALO_SOFT,
                marginBottom: 4,
              }}
            >
              Form
            </div>
            <MetricCitation
              sentence={vm.stateText}
              color={vm.stateColor}
              metrics={[{ label: 'Form score', value: fsLabel }]}
              sentenceStyle={{
                fontFamily: FONT.body,
                fontSize: 17,
                lineHeight: 1.25,
                textShadow: HALO_STRONG,
              }}
              chipStyle={{
                fontFamily: FONT.mono,
                color: C.text2,
                textShadow: HALO_SOFT,
              }}
            />
            <div
              style={{
                fontFamily: FONT.mono,
                fontSize: 8.5,
                color: C.text3,
                marginTop: 10,
                textAlign: 'center',
              }}
            >
              See the trend →
            </div>
          </div>
        ) : (
          <div style={{ padding: '11px 12px 9px' }}>
            <div
              style={{
                fontFamily: FONT.mono,
                fontSize: 9,
                fontWeight: 500,
                color: C.text3,
                marginBottom: 10,
              }}
            >
              Trend · {vm.headerDate}
            </div>
            <TrendRow
              label="Fitness · TFI · 42-day"
              value={vm.ctl}
              delta={vm.ctlDelta}
              deltaColor={vm.ctlDeltaColor}
              points={vm.ctlSpark}
              stroke={CHART.pastLine}
            />
            <TrendRow
              label="Fatigue · AFI · 7-day"
              value={vm.atl}
              delta={vm.atlDelta}
              deltaColor={vm.atlDeltaColor}
              points={vm.atlSpark}
              stroke={C.orange}
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                borderTop: `1px dashed ${C.border}`,
                paddingTop: 6,
              }}
            >
              <span style={{ fontFamily: FONT.body, fontSize: 11, color: CHART.axisMuted }}>Week volume</span>
              <span style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 13, color: C.text, textShadow: HALO_MED }}>
                {vm.volLabel}
              </span>
            </div>
            <div
              style={{
                fontFamily: FONT.mono,
                fontSize: 8.5,
                color: C.text3,
                marginTop: 10,
                textAlign: 'center',
              }}
            >
              Back
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TrendRow({
  label,
  value,
  delta,
  deltaColor,
  points,
  stroke,
}: {
  label: string;
  value: number;
  delta: string;
  deltaColor: string;
  points: string;
  stroke: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontFamily: FONT.body, fontSize: 11, color: CHART.axisMuted }}>{label}</span>
        <span style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 13, color: C.text }}>
          {value} <span style={{ color: deltaColor, fontSize: 10 }}>{delta}</span>
        </span>
      </div>
      <svg viewBox="0 0 130 32" width="100%" height="34" preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.6" />
      </svg>
    </div>
  );
}
