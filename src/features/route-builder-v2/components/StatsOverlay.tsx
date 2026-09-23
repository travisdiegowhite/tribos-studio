/**
 * StatsOverlay — Route Builder 2.0 route summary card.
 *
 * Shows distance, elevation gain, and estimated duration for the
 * current route. Hidden when no route exists.
 */

import { Box, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { Check, FloppyDisk, Warning, X } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { convertDistance } from '../../../utils/units.jsx';
import {
  SURFACE_COLORS,
  SURFACE_LABELS,
  computeSurfaceDistribution,
} from '../../../utils/surfaceOverlay.js';
import { LTS_COLORS, type StressSummary, type FacilitySummary } from '../../../utils/trafficStress';

export interface RouteStats {
  distance_km: number;
  elevation_gain_m: number;
  duration_s: number;
}

export interface TargetStatus {
  /** Which number the rider asked for. */
  mode: 'time' | 'distance';
  /** Signed miss as a fraction of target — negative means under. */
  error: number;
  /** Human-readable gap, e.g. "6 min under 90" or "4.2 km over 40". */
  label: string;
}

export interface StatsOverlayProps {
  stats: RouteStats | null;
  routeName?: string;
  onClear?: () => void;
  isImperial?: boolean;
  /** Per-segment surface categories (from SurfaceLayer); shows a surface line when present. */
  surfaceSegments?: string[] | null;
  /** Geometry the surface segments span; enables distance-weighted shares. */
  surfaceCoordinates?: ReadonlyArray<ReadonlyArray<number>> | null;
  /**
   * Traffic-stress roll-up for the route (useRouteStress). Drives the
   * QUIET ROADS stat; null shows a placeholder while it's being measured.
   */
  stressSummary?: StressSummary | null;
  /** Measurement state, so "still measuring" and "couldn't measure" read differently. */
  stressStatus?: 'idle' | 'loading' | 'ready' | 'unavailable';
  /**
   * Bike-lane / shoulder coverage (same measurement as stress). Drives the
   * BIKE LANES stat; shares `stressStatus`.
   */
  facilitySummary?: FacilitySummary | null;
  /** Click handler for the QUIET ROADS stat: colours the map by stress. */
  onToggleStress?: () => void;
  /** Whether the stress overlay is currently shown (pressed styling). */
  stressActive?: boolean;
  /** Quick-save action; renders a Save affordance next to Clear when set. */
  onSave?: () => void;
  saveState?: 'saved' | 'unsaved' | 'saving';
  /**
   * How far the route is from what the rider asked for, when that's worth
   * saying. Recomputed by the page as the route changes, so it keeps tracking
   * while the route is hand-edited rather than being a one-shot check.
   */
  targetStatus?: TargetStatus | null;
  /** Ask the route coach to close the gap. Renders the chip as a button. */
  onFixTarget?: () => void;
}

const SURFACE_ORDER = ['paved', 'gravel', 'unpaved', 'mixed'] as const;

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// Compact distance: <10 → one decimal, else integer. Converts to miles when
// imperial, preserving the same glued "<n><unit>" style (e.g. "52km" / "33mi").
function formatDistanceCompact(km: number, isImperial: boolean): string {
  const value = isImperial ? convertDistance.kmToMiles(km) : km;
  const unit = isImperial ? 'mi' : 'km';
  if (!value || value <= 0) return `0${unit}`;
  const num = value < 10 ? value.toFixed(1) : Math.round(value).toString();
  return `${num}${unit}`;
}

function formatElevationCompact(m: number, isImperial: boolean): string {
  // Guard against a non-finite gain (e.g. an in-flight/failed elevation fetch
  // that left the stat undefined) so we never render "NaNft".
  const safeM = Number.isFinite(m) ? m : 0;
  const value = isImperial ? convertDistance.mToFt(safeM) : safeM;
  return `${Math.round(value)}${isImperial ? 'ft' : 'm'}`;
}

function surfaceBreakdown(
  segments: string[] | null | undefined,
  coordinates?: ReadonlyArray<ReadonlyArray<number>> | null,
) {
  if (!segments || segments.length === 0) return [];
  const dist = computeSurfaceDistribution(
    segments,
    (coordinates ?? null) as Array<[number, number]> | null,
  ) as Record<string, number>;
  return SURFACE_ORDER.filter((k) => (dist[k] ?? 0) > 0).map((k) => ({
    key: k,
    pct: dist[k],
    color: (SURFACE_COLORS as Record<string, string>)[k],
    label: (SURFACE_LABELS as Record<string, string>)[k],
  }));
}

export function StatsOverlay({
  stats,
  routeName,
  onClear,
  isImperial = false,
  surfaceSegments,
  surfaceCoordinates = null,
  stressSummary = null,
  stressStatus = 'idle',
  facilitySummary = null,
  onToggleStress,
  stressActive = false,
  onSave,
  saveState = 'unsaved',
  targetStatus = null,
  onFixTarget,
}: StatsOverlayProps) {
  if (!stats || stats.distance_km <= 0) return null;

  const surfaces = surfaceBreakdown(surfaceSegments, surfaceCoordinates);

  return (
    <Box
      data-testid="rb2-stats-overlay"
      style={{
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        borderRadius: 0,
        padding: '12px 14px',
        boxShadow: RB2.shadowCard,
        minWidth: 260,
      }}
    >
      <Box
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: routeName ? 6 : 0,
        }}
      >
        {routeName ? (
          <Text
            style={{
              fontFamily: RB2_FONT.mono,
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: RB2.textTertiary,
              lineHeight: 1.4,
            }}
          >
            {routeName}
          </Text>
        ) : (
          <span />
        )}
        <Box style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onSave && (
            <UnstyledButton
              data-testid="rb2-stats-save"
              onClick={saveState === 'saving' ? undefined : onSave}
              aria-label={saveState === 'saved' ? 'Route saved' : 'Save route'}
              disabled={saveState === 'saving'}
              style={{
                padding: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: saveState === 'unsaved' ? RB2.teal : RB2.textTertiary,
                fontFamily: RB2_FONT.mono,
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: saveState === 'saving' ? 'default' : 'pointer',
              }}
            >
              {saveState === 'saving' ? (
                'Saving…'
              ) : saveState === 'saved' ? (
                <>
                  Saved <Check size={12} />
                </>
              ) : (
                <>
                  <span aria-hidden style={{ fontSize: 8, lineHeight: 1 }}>
                    ●
                  </span>{' '}
                  Save <FloppyDisk size={12} />
                </>
              )}
            </UnstyledButton>
          )}
          {onClear && (
            <UnstyledButton
              data-testid="rb2-stats-clear"
              onClick={onClear}
              aria-label="Clear route"
              style={{
                padding: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: RB2.textTertiary,
                fontFamily: RB2_FONT.mono,
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              Clear <X size={12} />
            </UnstyledButton>
          )}
        </Box>
      </Box>
      <Box data-testid="rb2-stats-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
        <StatCell label="Distance" value={formatDistanceCompact(stats.distance_km, isImperial)} />
        <StatCell label="Elevation" value={formatElevationCompact(stats.elevation_gain_m, isImperial)} />
        <StatCell label="Duration" value={formatDuration(stats.duration_s)} />
        <QuietRoadsCell
          summary={stressSummary}
          status={stressStatus}
          isImperial={isImperial}
          onToggle={onToggleStress}
          active={stressActive}
        />
        <BikeLanesCell summary={facilitySummary} status={stressStatus} isImperial={isImperial} />
      </Box>
      {targetStatus && (
        <Box style={{ marginTop: 8 }}>
          <UnstyledButton
            data-testid="rb2-stats-target"
            component={onFixTarget ? 'button' : 'div'}
            onClick={onFixTarget}
            aria-label={
              onFixTarget
                ? `${targetStatus.label}. Ask the coach to fix it.`
                : targetStatus.label
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
              padding: '5px 7px',
              border: `1px solid ${RB2.border}`,
              backgroundColor: 'transparent',
              cursor: onFixTarget ? 'pointer' : 'default',
              textAlign: 'left',
            }}
          >
            <Warning size={12} color={RB2.textTertiary} weight="bold" />
            <Text
              style={{
                flex: 1,
                fontFamily: RB2_FONT.mono,
                fontSize: 10,
                letterSpacing: '0.04em',
                color: RB2.textSecondary,
              }}
            >
              {targetStatus.label}
            </Text>
            {onFixTarget && (
              <Text
                style={{
                  fontFamily: RB2_FONT.mono,
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: RB2.textTertiary,
                }}
              >
                Fix
              </Text>
            )}
          </UnstyledButton>
        </Box>
      )}
      {surfaces.length > 0 && (
        <Box
          data-testid="rb2-stats-surface"
          style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 8 }}
        >
          {surfaces.map((s) => (
            <Box key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Box style={{ width: 8, height: 8, backgroundColor: s.color, flexShrink: 0 }} />
              <Text
                style={{
                  fontFamily: RB2_FONT.mono,
                  fontSize: 10,
                  letterSpacing: '0.04em',
                  color: RB2.textSecondary,
                  whiteSpace: 'nowrap',
                }}
              >
                {s.pct}% {s.label}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function formatStressKm(km: number, isImperial: boolean): string {
  const value = isImperial ? (convertDistance.kmToMiles(km) as number) : km;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${isImperial ? 'mi' : 'km'}`;
}

/** Colour for the QUIET ROADS value: the LTS band the route mostly sits in. */
export function quietRoadsColor(quietPct: number): string {
  if (quietPct >= 80) return LTS_COLORS[1];
  if (quietPct >= 60) return LTS_COLORS[2];
  if (quietPct >= 40) return LTS_COLORS[3];
  return LTS_COLORS[4];
}

/**
 * The fourth stat: share of the mapped route on calm/comfortable roads, with
 * the high-stress distance beneath. Clickable when the page hands it a
 * toggle, so the number is one click from the coloured map.
 */
function QuietRoadsCell({
  summary,
  status,
  isImperial,
  onToggle,
  active,
}: {
  summary: StressSummary | null;
  status: 'idle' | 'loading' | 'ready' | 'unavailable';
  isImperial: boolean;
  onToggle?: () => void;
  active: boolean;
}) {
  const measured = !!summary && summary.knownKm > 0;
  const unmapped = !!summary && summary.knownKm === 0;
  const failed = !summary && status === 'unavailable';
  const value = measured ? `${summary!.quietPct}%` : unmapped || failed ? 'n/a' : '—';
  const color = measured ? quietRoadsColor(summary!.quietPct) : RB2.textTertiary;
  const detail = measured
    ? summary!.lts4Km > 0
      ? `${formatStressKm(summary!.lts4Km, isImperial)} high stress`
      : 'no high-stress roads'
    : failed
      ? 'road data unavailable'
      : unmapped
        ? 'no mapped roads'
        : null;

  const body = (
    <>
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: active ? RB2.teal : RB2.textTertiary,
          lineHeight: 1.2,
        }}
      >
        Quiet roads
      </Text>
      <Text
        style={{
          fontFamily: RB2_FONT.heading,
          fontSize: 22,
          fontWeight: 700,
          color,
          lineHeight: 1.1,
          letterSpacing: '0.02em',
        }}
      >
        {value}
      </Text>
      {detail && (
        <Text
          style={{
            fontFamily: RB2_FONT.mono,
            fontSize: 9,
            letterSpacing: '0.04em',
            color: RB2.textTertiary,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          {detail}
        </Text>
      )}
    </>
  );

  if (!onToggle) {
    return <Box data-testid="rb2-stats-stress">{body}</Box>;
  }
  return (
    <Tooltip
      label={
        failed
          ? 'Road data unavailable right now'
          : active
            ? 'Show the plain route line'
            : 'Color the map by traffic stress'
      }
      position="bottom"
      withinPortal
    >
      <UnstyledButton
        data-testid="rb2-stats-stress"
        onClick={onToggle}
        aria-pressed={active}
        aria-label={active ? 'Hide traffic stress on the map' : 'Show traffic stress on the map'}
        style={{
          textAlign: 'left',
          padding: '0 4px',
          margin: '0 -4px',
          borderBottom: `2px solid ${active ? RB2.teal : 'transparent'}`,
          cursor: 'pointer',
        }}
      >
        {body}
      </UnstyledButton>
    </Tooltip>
  );
}

/** Colour for the BIKE LANES value: never a warning colour, absence is not danger. */
export function bikeLanesColor(facilityPct: number): string {
  if (facilityPct >= 50) return LTS_COLORS[1];
  if (facilityPct >= 25) return LTS_COLORS[2];
  return RB2.textPrimary;
}

const FACILITY_DETAIL_ORDER = ['protected', 'lane', 'shoulder'] as const;
const FACILITY_DETAIL_LABEL: Record<(typeof FACILITY_DETAIL_ORDER)[number], string> = {
  protected: 'protected',
  lane: 'lanes',
  shoulder: 'shoulder',
};

/**
 * The fifth stat: share of the mapped route on a protected cycleway, a bike
 * lane or a rideable shoulder, with the km of each beneath. Trails (tracks,
 * footways, unsigned paths) are reported separately and never counted.
 */
function BikeLanesCell({
  summary,
  status,
  isImperial,
}: {
  summary: FacilitySummary | null;
  status: 'idle' | 'loading' | 'ready' | 'unavailable';
  isImperial: boolean;
}) {
  const measured = !!summary && summary.knownKm > 0;
  const unmapped = !!summary && summary.knownKm === 0;
  const failed = !summary && status === 'unavailable';
  const value = measured ? `${summary!.facilityPct}%` : unmapped || failed ? 'n/a' : '—';
  const color = measured ? bikeLanesColor(summary!.facilityPct) : RB2.textTertiary;
  let detail: string | null = null;
  if (measured) {
    const parts = FACILITY_DETAIL_ORDER.filter((k) => summary!.kmByKind[k] > 0).map(
      (k) => `${formatStressKm(summary!.kmByKind[k], isImperial)} ${FACILITY_DETAIL_LABEL[k]}`,
    );
    detail =
      parts.length > 0
        ? parts.join(' · ')
        : summary!.kmByKind.trail > 0
          ? 'trail only'
          : 'no bike lanes';
  } else if (failed) {
    detail = 'road data unavailable';
  } else if (unmapped) {
    detail = 'no mapped roads';
  }

  return (
    <Tooltip
      label="Share of the mapped route on a protected cycleway, a bike lane or a rideable shoulder. Trails are not counted."
      position="bottom"
      withinPortal
    >
      <Box data-testid="rb2-stats-facility">
        <Text
          style={{
            fontFamily: RB2_FONT.mono,
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: RB2.textTertiary,
            lineHeight: 1.2,
          }}
        >
          Bike lanes
        </Text>
        <Text
          style={{
            fontFamily: RB2_FONT.heading,
            fontSize: 22,
            fontWeight: 700,
            color,
            lineHeight: 1.1,
            letterSpacing: '0.02em',
          }}
        >
          {value}
        </Text>
        {detail && (
          <Text
            style={{
              fontFamily: RB2_FONT.mono,
              fontSize: 9,
              letterSpacing: '0.04em',
              color: RB2.textTertiary,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
            }}
          >
            {detail}
          </Text>
        )}
      </Box>
    </Tooltip>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: RB2.textTertiary,
          lineHeight: 1.2,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: RB2_FONT.heading,
          fontSize: 22,
          fontWeight: 700,
          color: RB2.textPrimary,
          lineHeight: 1.1,
          letterSpacing: '0.02em',
        }}
      >
        {value}
      </Text>
    </Box>
  );
}

export default StatsOverlay;
