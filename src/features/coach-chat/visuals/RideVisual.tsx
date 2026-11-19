/**
 * ride_streams and power_curve — one activity (or, for power_curve, the
 * athlete's rides over a date range), loaded under RLS and drawn with the
 * same components as the ride analysis modal.
 *
 * ride_streams: the route map with the coach's stretch in lime, and the
 * power/HR/speed chart with the same band. Dragging across the chart selects
 * a new stretch to ask about.
 */

import { useEffect, useMemo, useState } from 'react';
import { Box, Stack } from '@mantine/core';
import ColoredRouteMap from '../../../components/ColoredRouteMap.jsx';
import RideStreamsChart from '../../../components/RideStreamsChart.jsx';
import ActivityPowerCurve from '../../../components/ActivityPowerCurve.jsx';
import RideZonesChart from '../../../components/RideZonesChart.jsx';
import { supabase } from '../../../lib/supabase';
import { isRunningActivity } from '../../../utils/sportType';
import type { CoachFocus } from '../coachApi';
import type { PowerCurveVisual, RideStreamsVisual } from './types';
import { useAthleteBasics } from './useAthleteBasics';
import { combinePowerCurves, formatRangeKm, roundRangeKm, shortDate } from './visualData';
import { VisualFrame, VisualLoading, VisualMissing } from './VisualFrame';

type ActivityRow = Record<string, any> & { id: string; name?: string; start_date?: string; provider?: string };

function useActivity(activityId: string | null | undefined) {
  const [row, setRow] = useState<ActivityRow | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!activityId) return;
    let cancelled = false;
    // RLS scopes this to the athlete; '*' because the chart helpers read a
    // spread of sport, duration and stream fields.
    supabase
      .from('activities')
      .select('*')
      .eq('id', activityId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) setFailed(true);
        else setRow(data as ActivityRow);
      });
    return () => {
      cancelled = true;
    };
  }, [activityId]);
  return { row, failed };
}

function rideTitle(row: ActivityRow | null, fallback: string) {
  if (!row) return fallback;
  const date = shortDate(row.start_date);
  return row.name ? `${row.name} · ${date}` : date || fallback;
}

export function RideStreamsCard({ spec, onFocus }: { spec: RideStreamsVisual; onFocus: (f: CoachFocus) => void }) {
  const { ftp, isImperial } = useAthleteBasics();
  const { row, failed } = useActivity(spec.activity_id);
  // The athlete's own selection replaces the coach's band once they drag.
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const highlight = selected ?? spec.range_km ?? null;

  const isRun = row ? isRunningActivity(row as Parameters<typeof isRunningActivity>[0]) : false;
  const title = rideTitle(row, 'Ride');
  const streams = row?.activity_streams;

  if (failed) return <VisualMissing title="Ride" reason="That ride isn’t available any more." />;

  const handleSelect = (start_km: number, end_km: number) => {
    const range = roundRangeKm(start_km, end_km);
    setSelected(range);
    onFocus({
      kind: 'ride_segment',
      activity_id: spec.activity_id,
      range_km: range,
      label: `${row?.name || 'Ride'} ${shortDate(row?.start_date)} · ${formatRangeKm(range, isImperial)}`,
    });
  };

  return (
    <VisualFrame
      title={title}
      caption={
        [spec.caption, highlight ? `marked: ${formatRangeKm(highlight, isImperial)}` : null].filter(Boolean).join(' · ') ||
        undefined
      }
      providers={[row?.provider]}
      openHref={`/train?tab=rides&ride=${spec.activity_id}`}
      openLabel="Full analysis"
    >
      {!row ? (
        <VisualLoading height={420} />
      ) : (
        <Stack gap="sm">
          {streams?.coords?.length > 1 && (
            <ColoredRouteMap
              activityStreams={streams}
              routeCoords={null}
              maxHr={null}
              ftp={isRun ? null : ftp}
              sport={isRun ? 'running' : 'cycling'}
              isImperial={isImperial}
              height={240}
              frameless
              showStrip={false}
              highlightRange_km={highlight}
            />
          )}
          <RideStreamsChart
            activity={row}
            isImperial={isImperial}
            highlightRange_km={highlight}
            onSelectRange={handleSelect}
          />
        </Stack>
      )}
    </VisualFrame>
  );
}

export function PowerCurveCard({ spec }: { spec: PowerCurveVisual }) {
  const { ftp, weight_kg, userId } = useAthleteBasics();
  const { row, failed } = useActivity(spec.activity_id);
  const [periodRows, setPeriodRows] = useState<ActivityRow[] | null>(null);
  const isPeriod = !spec.activity_id;

  useEffect(() => {
    if (!isPeriod || !userId || !spec.from || !spec.to) return;
    let cancelled = false;
    supabase
      .from('activities')
      .select('id, start_date, provider, power_curve_summary')
      .eq('user_id', userId)
      .gte('start_date', `${spec.from}T00:00:00`)
      .lte('start_date', `${spec.to}T23:59:59`)
      .not('power_curve_summary', 'is', null)
      .then(({ data }) => {
        if (!cancelled) setPeriodRows((data as ActivityRow[]) || []);
      });
    return () => {
      cancelled = true;
    };
  }, [isPeriod, userId, spec.from, spec.to]);

  const periodCurve = useMemo(
    () => (periodRows ? combinePowerCurves(periodRows.map((r) => r.power_curve_summary)) : null),
    [periodRows],
  );

  if (!isPeriod && failed) return <VisualMissing title="Power curve" reason="That ride isn’t available any more." />;

  const title = isPeriod
    ? `Power curve · ${shortDate(spec.from)} – ${shortDate(spec.to)}`
    : `Power curve · ${rideTitle(row, 'Ride')}`;
  const loading = isPeriod ? periodRows === null : !row;
  const summary = isPeriod ? periodCurve : row?.power_curve_summary;
  const providers = isPeriod ? (periodRows || []).map((r) => r.provider) : [row?.provider];

  return (
    <VisualFrame
      title={title}
      caption={spec.caption}
      providers={providers}
      openHref={isPeriod ? '/train?tab=progress' : `/train?tab=rides&ride=${spec.activity_id}`}
      openLabel={isPeriod ? 'Progress' : 'Full analysis'}
    >
      {loading ? (
        <VisualLoading height={260} />
      ) : (
        <Stack gap="md">
          {summary && Object.keys(summary).length > 0 ? (
            <ActivityPowerCurve powerCurveSummary={summary} ftp={ftp} weight={weight_kg} />
          ) : (
            <Box c="dimmed" fz="sm">
              No power data for {isPeriod ? 'that period' : 'that ride'}.
            </Box>
          )}
          {!isPeriod && spec.show_zones && row && <RideZonesChart activity={row} ftp={ftp} maxHr={null} />}
        </Stack>
      )}
    </VisualFrame>
  );
}

export default function RideVisual({
  spec,
  onFocus,
}: {
  spec: RideStreamsVisual | PowerCurveVisual;
  onFocus: (f: CoachFocus) => void;
}) {
  return spec.kind === 'ride_streams' ? <RideStreamsCard spec={spec} onFocus={onFocus} /> : <PowerCurveCard spec={spec} />;
}
