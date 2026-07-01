/**
 * FitnessNode — Zone 01. The floating frosted-glass card that sits on the spine
 * as the "today" marker and scrubs along it. Front = FORM/TSB + readiness ring +
 * TFI/AFI/volume; back (on click) = the CTL/ATL trend sparklines. The teal
 * header doubles as the day's workout chip and the drag handle.
 *
 * The frosted-glass fill + white text-shadow halos are intentional and tuned
 * (see docs/today-view) — kept verbatim so readouts stay legible over the curve.
 * On mobile the card renders `compact` (solid, non-floating, read-only).
 */

import { ringDash } from './spineGeometry';
import { C, CHART, FONT } from './tokens';
import type { NodeVM } from './nodeView';

interface FitnessNodeProps {
  vm: NodeVM;
  dispTSB: number;
  dispReady: number;
  flipped: boolean;
  ringHover: boolean;
  nodeLeftPct?: string;
  compact?: boolean;
  onHeaderPointerDown?: (e: React.PointerEvent) => void;
  onSnapToday?: (e: React.MouseEvent) => void;
  onToggleFlip?: () => void;
  onRingEnter?: () => void;
  onRingLeave?: () => void;
}

const HALO_STRONG =
  '0 1px 3px rgba(244,244,242,1), 0 0 3px rgba(244,244,242,1), 0 0 6px rgba(244,244,242,.8)';
const HALO_MED = '0 1px 2px rgba(244,244,242,1), 0 0 4px rgba(244,244,242,.85)';
const HALO_SOFT = '0 1px 1px rgba(244,244,242,.85)';

export function FitnessNode({
  vm,
  dispTSB,
  dispReady,
  flipped,
  ringHover,
  nodeLeftPct,
  compact = false,
  onHeaderPointerDown,
  onSnapToday,
  onToggleFlip,
  onRingEnter,
  onRingLeave,
}: FitnessNodeProps) {
  const readyNum = Math.round(dispReady);
  const tsbLabel = `${dispTSB >= 0 ? '+' : ''}${Math.round(dispTSB)}`;

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
          {!vm.isToday && !compact && (
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
              TODAY ▸
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

      {/* Body — click flips FRONT ↔ BACK. */}
      <div
        onPointerDown={compact ? undefined : (e) => e.stopPropagation()}
        onClick={compact ? undefined : onToggleFlip}
        style={{ cursor: compact ? 'default' : 'pointer', position: 'relative' }}
      >
        {!flipped ? (
          <div style={{ padding: '11px 12px 9px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 9,
                    fontWeight: 500,
                    letterSpacing: '1.5px',
                    color: '#45443f',
                    textShadow: HALO_SOFT,
                  }}
                >
                  FORM · TSB
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span
                    style={{
                      fontFamily: FONT.mono,
                      fontWeight: 500,
                      fontSize: 41,
                      lineHeight: 0.9,
                      color: CHART.ink,
                      fontVariantNumeric: 'tabular-nums',
                      textShadow: HALO_STRONG,
                    }}
                  >
                    {tsbLabel}
                  </span>
                  <span style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 15, color: vm.arrowColor }}>
                    {vm.arrowChar}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: FONT.body,
                    fontWeight: 600,
                    fontSize: 11,
                    color: vm.stateColor,
                    letterSpacing: '.02em',
                    marginTop: 2,
                    textShadow: HALO_MED,
                  }}
                >
                  {vm.stateText}
                </div>
              </div>
              <div
                onMouseEnter={onRingEnter}
                onMouseLeave={onRingLeave}
                onClick={(e) => e.stopPropagation()}
                style={{ textAlign: 'center', cursor: 'help' }}
              >
                <svg width="54" height="54" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="25" fill="none" stroke={CHART.ringTrack} strokeWidth="7" />
                  <circle
                    cx="32"
                    cy="32"
                    r="25"
                    fill="none"
                    stroke={vm.ringColor}
                    strokeWidth="7"
                    strokeDasharray={ringDash(dispReady)}
                    strokeLinecap="round"
                    transform="rotate(-90 32 32)"
                  />
                  <text
                    x="32"
                    y="34"
                    textAnchor="middle"
                    style={{
                      fontFamily: FONT.mono,
                      fontWeight: 500,
                      fontSize: 18,
                      fill: CHART.ink,
                      paintOrder: 'stroke',
                      stroke: 'rgba(244,244,242,1)',
                      strokeWidth: '3.5px',
                    }}
                  >
                    {readyNum}
                  </text>
                  <text
                    x="32"
                    y="45"
                    textAnchor="middle"
                    style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 6, fill: C.text3, letterSpacing: '1px' }}
                  >
                    READY
                  </text>
                </svg>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                marginTop: 11,
                borderTop: `1px dashed ${C.border}`,
              }}
            >
              <NodeStat label="CTL · FITNESS" value={vm.ctl} />
              <NodeStat label="ATL · FATIGUE" value={vm.atl} divider />
              <NodeStat label="WK VOLUME" value={vm.volLabel} divider />
            </div>

            <div
              style={{
                fontFamily: FONT.mono,
                fontSize: 8.5,
                letterSpacing: '1px',
                color: '#c9c7c0',
                marginTop: 9,
                textAlign: 'center',
              }}
            >
              CLICK FOR CTL / ATL DETAIL
            </div>

            {ringHover && !compact && (
              <div
                style={{
                  position: 'absolute',
                  right: 12,
                  top: 98,
                  width: 206,
                  background: C.navy,
                  border: `1px solid ${C.teal}`,
                  boxShadow: '0 10px 24px rgba(20,16,8,.35)',
                  padding: '11px 12px',
                  zIndex: 5,
                }}
              >
                <div
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 8,
                    fontWeight: 500,
                    letterSpacing: '1.5px',
                    color: '#3BA89D',
                    marginBottom: 8,
                  }}
                >
                  WHY READINESS {readyNum}
                </div>
                {vm.reasons.map((r) => (
                  <div
                    key={r.k}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginBottom: 5,
                    }}
                  >
                    <span style={{ fontFamily: FONT.body, fontSize: 11, color: '#B0B0A8' }}>{r.k}</span>
                    <span style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: 10, color: r.c }}>{r.v}</span>
                  </div>
                ))}
                <div
                  style={{
                    borderTop: '1px solid #2E2E2A',
                    marginTop: 6,
                    paddingTop: 6,
                    fontFamily: FONT.body,
                    fontSize: 10,
                    lineHeight: 1.35,
                    color: C.text3,
                  }}
                >
                  → feeds today’s coach call
                </div>
              </div>
            )}
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
              label="CTL · 42-DAY FITNESS"
              value={vm.ctl}
              delta={vm.ctlDelta}
              deltaColor={vm.ctlDeltaColor}
              points={vm.ctlSpark}
              stroke={CHART.pastLine}
            />
            <TrendRow
              label="ATL · 7-DAY FATIGUE"
              value={vm.atl}
              delta={vm.atlDelta}
              deltaColor={vm.atlDeltaColor}
              points={vm.atlSpark}
              stroke={C.orange}
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
              CLICK TO CLOSE
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NodeStat({ label, value, divider }: { label: string; value: number | string; divider?: boolean }) {
  return (
    <div
      style={{
        padding: divider ? '8px 0 0' : '8px 0 0',
        borderLeft: divider ? '1px solid #eeece6' : undefined,
        paddingLeft: divider ? 12 : undefined,
      }}
    >
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 8,
          fontWeight: 500,
          letterSpacing: '1px',
          color: '#55544e',
          textShadow: HALO_SOFT,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONT.mono,
          fontWeight: 500,
          fontSize: 20,
          color: CHART.ink,
          textShadow: HALO_MED,
        }}
      >
        {value}
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
