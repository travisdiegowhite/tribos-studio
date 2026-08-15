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
  '0 1px 3px rgba(244,244,242,1), 0 0 3px rgba(244,244,242,1), 0 0 6px rgba(244,244,242,.8)';
const HALO_MED = '0 1px 2px rgba(244,244,242,1), 0 0 4px rgba(244,244,242,.85)';
const HALO_SOFT = '0 1px 1px rgba(244,244,242,.85)';

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
        boxShadow: '0 6px 18px rgba(42,140,130,.16)',
      }
    : {
        position: 'absolute',
        left: nodeLeftPct,
        top: 52,
        transform: 'translateX(-50%)',
        width: 236,
        background: 'rgba(255,255,255,.18)',
        backdropFilter: 'blur(6px) saturate(1.05)',
        WebkitBackdropFilter: 'blur(6px) saturate(1.05)',
        border: `1.5px solid ${C.teal}`,
        boxShadow: '0 12px 30px rgba(20,16,8,.16)',
      };

  return (
    <div style={containerStyle}>
      {/* Teal header — day's workout chip + drag handle. */}
      <div
        onPointerDown={compact ? undefined : onHeaderPointerDown}
        style={{
          padding: '7px 12px 8px',
          borderBottom: '1px solid rgba(255,255,255,.32)',
          background: 'rgba(42,140,130,.62)',
          cursor: compact ? 'default' : 'grab',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 8.5,
              fontWeight: 500,
              letterSpacing: '1px',
              color: 'rgba(255,255,255,.88)',
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
                border: '1px solid rgba(255,255,255,.55)',
                background: 'rgba(255,255,255,.16)',
                color: '#fff',
                fontFamily: FONT.mono,
                fontSize: 8,
                fontWeight: 500,
                letterSpacing: '1.5px',
                padding: '2px 7px',
                cursor: 'pointer',
              }}
            >
              {vm.isFuture ? '◂ TODAY' : 'TODAY ▸'}
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
              letterSpacing: '.5px',
              color: vm.activity.tagColor,
              border: '1px solid rgba(255,255,255,.5)',
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
              color: '#fff',
              letterSpacing: '.01em',
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
              color: 'rgba(255,255,255,.82)',
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
                letterSpacing: '1.5px',
                color: '#45443f',
                textShadow: HALO_SOFT,
                marginBottom: 4,
              }}
            >
              FORM
            </div>
            <MetricCitation
              sentence={vm.stateText}
              color={vm.stateColor}
              metrics={[{ label: 'FS', value: fsLabel }]}
              sentenceStyle={{
                fontFamily: FONT.body,
                fontSize: 17,
                lineHeight: 1.25,
                letterSpacing: '.01em',
                textShadow: HALO_STRONG,
              }}
              chipStyle={{
                fontFamily: FONT.mono,
                color: '#45443f',
                textShadow: HALO_SOFT,
              }}
            />
            <div
              style={{
                fontFamily: FONT.mono,
                fontSize: 8.5,
                letterSpacing: '1px',
                color: '#c9c7c0',
                marginTop: 10,
                textAlign: 'center',
              }}
            >
              SEE THE TREND →
            </div>
          </div>
        ) : (
          <div style={{ padding: '11px 12px 9px' }}>
            <div
              style={{
                fontFamily: FONT.mono,
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: '1.5px',
                color: C.text3,
                marginBottom: 10,
              }}
            >
              TREND · {vm.headerDate}
            </div>
            <TrendRow
              label="FITNESS · TFI · 42-DAY"
              value={vm.ctl}
              delta={vm.ctlDelta}
              deltaColor={vm.ctlDeltaColor}
              points={vm.ctlSpark}
              stroke={CHART.pastLine}
            />
            <TrendRow
              label="FATIGUE · AFI · 7-DAY"
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
              <span style={{ fontFamily: FONT.mono, fontSize: 9, color: CHART.axisMuted }}>WK VOLUME</span>
              <span style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 13, color: C.text, textShadow: HALO_MED }}>
                {vm.volLabel}
              </span>
            </div>
            <div
              style={{
                fontFamily: FONT.mono,
                fontSize: 8.5,
                letterSpacing: '1px',
                color: '#c9c7c0',
                marginTop: 10,
                textAlign: 'center',
              }}
            >
              BACK
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
        <span style={{ fontFamily: FONT.mono, fontSize: 9, color: CHART.axisMuted }}>{label}</span>
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
