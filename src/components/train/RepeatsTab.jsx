/**
 * RepeatsTab — the REPEATS tab on /train: every ride that repeats an anchor
 * path, overlaid on one map with their metric traces aligned by distance
 * along the anchor, and a list of the efforts to pick from.
 *
 * The anchor is the ride on the map card above ("this ride") or a segment
 * from the athlete's library. Matching and alignment are pure
 * (src/utils/rideRepeats.ts) and run in the browser over the rides /train
 * already holds — no new reads.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Loader,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { ChartBar } from '@phosphor-icons/react';
import { useSegmentLibrary } from '../../hooks/useSegmentLibrary';
import {
  anchorFromRide,
  anchorFromSegment,
  effortPointAt,
  findRepeats,
  repeatBests,
  repeatColor,
} from '../../utils/rideRepeats';
import RepeatsMap from './RepeatsMap';
import RepeatsStrip from './RepeatsStrip';

const MAX_SELECTED = 8;
const DEFAULT_SELECTED = 6;

const METRIC_OPTIONS = [
  { value: 'power', label: 'Power', key: 'power', unit: 'W' },
  { value: 'heartRate', label: 'Heart rate', key: 'heartRate', unit: 'bpm' },
  { value: 'speed', label: 'Speed', key: 'speed_kmh', unit: 'km/h' },
];

const mono = { fontFamily: "'DM Mono', monospace" };
const eyebrowStyle = {
  ...mono,
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '2px',
  textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
};

export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

function formatShortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

function Swatch({ color, selected, onClick, label }) {
  return (
    <UnstyledButton
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      style={{
        width: 14,
        height: 14,
        flexShrink: 0,
        border: `2px solid ${color}`,
        backgroundColor: selected ? color : 'transparent',
      }}
    />
  );
}

function Stat({ label, value }) {
  return (
    <Box style={{ minWidth: 52 }}>
      <Text style={{ ...mono, fontSize: 8, letterSpacing: '1px', color: 'var(--color-text-muted)' }}>{label}</Text>
      <Text style={{ ...mono, fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>{value}</Text>
    </Box>
  );
}

/**
 * @param {object} props
 * @param {object|null} props.anchorRide   The ride on the map card (anchor for "this ride").
 * @param {object[]} props.activities      Every visible activity row.
 * @param {string|undefined} props.userId
 * @param {(km: number) => string} props.formatDistance
 * @param {(kmh: number) => string} props.formatSpeed
 * @param {(ride: object) => void} props.onOpenRide   Opens the full analysis.
 */
function RepeatsTab({ anchorRide, activities, userId, formatDistance, formatSpeed, onOpenRide }) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [anchorKind, setAnchorKind] = useState('ride');
  const [segmentId, setSegmentId] = useState(null);
  // null = "the default pick" (newest efforts) until the athlete changes it.
  const [selectedIds, setSelectedIds] = useState(null);
  const [metric, setMetric] = useState('power');
  const [hoverX, setHoverX] = useState(null);

  const { segments, loading: segmentsLoading } = useSegmentLibrary(anchorKind === 'segment' ? userId : undefined);

  const segmentOptions = useMemo(
    () =>
      segments
        .filter((s) => s.geojson?.coordinates?.length > 1)
        .map((s) => ({
          value: s.id,
          label: `${s.display_name}${s.distance_meters ? ` · ${formatDistance(s.distance_meters / 1000)}` : ''}${s.ride_count > 1 ? ` · ${s.ride_count} rides` : ''}`,
        })),
    [segments, formatDistance],
  );

  const anchor = useMemo(() => {
    if (anchorKind === 'segment') {
      return anchorFromSegment(segments.find((s) => s.id === segmentId) ?? null);
    }
    return anchorFromRide(anchorRide);
  }, [anchorKind, anchorRide, segments, segmentId]);

  const efforts = useMemo(
    () => findRepeats(anchor, activities).map((e, i) => ({ ...e, color: repeatColor(i) })),
    [anchor, activities],
  );

  // A new anchor starts from the default pick again.
  const anchorKey = anchor ? `${anchor.kind}:${anchor.id}` : '';
  useEffect(() => {
    setSelectedIds(null);
    setHoverX(null);
  }, [anchorKey]);

  const selectedSet = useMemo(() => {
    if (selectedIds) return selectedIds;
    return new Set(efforts.slice(0, DEFAULT_SELECTED).map((e) => e.id));
  }, [selectedIds, efforts]);
  const selectedEfforts = useMemo(() => efforts.filter((e) => selectedSet.has(e.id)), [efforts, selectedSet]);
  const atCap = selectedSet.size >= MAX_SELECTED;

  const toggle = useCallback(
    (id) => {
      setSelectedIds((prev) => {
        const next = new Set(prev ?? efforts.slice(0, DEFAULT_SELECTED).map((e) => e.id));
        if (next.has(id)) next.delete(id);
        else if (next.size < MAX_SELECTED) next.add(id);
        return next;
      });
    },
    [efforts],
  );

  const bests = useMemo(() => repeatBests(efforts), [efforts]);

  const availableMetrics = useMemo(
    () =>
      METRIC_OPTIONS.filter((m) => selectedEfforts.some((e) => e.rows?.some((r) => r[m.key] != null))),
    [selectedEfforts],
  );
  const activeMetric = availableMetrics.some((m) => m.value === metric)
    ? metric
    : (availableMetrics[0]?.value ?? 'power');
  const metricDef = METRIC_OPTIONS.find((m) => m.value === activeMetric);

  const series = useMemo(
    () => selectedEfforts.filter((e) => e.rows).map((e) => ({ id: e.id, color: e.color, rows: e.rows })),
    [selectedEfforts],
  );
  const elevationRows = useMemo(
    () => selectedEfforts.find((e) => e.rows?.some((r) => r.elevation_m != null))?.rows ?? null,
    [selectedEfforts],
  );

  const measuredCount = efforts.filter((e) => e.measured).length;

  const readoutFor = (effort) => {
    if (hoverX == null || !effort.rows || !selectedSet.has(effort.id) || !metricDef) return null;
    const at = effortPointAt(effort, hoverX);
    const v = at?.row?.[metricDef.key];
    if (v == null) return null;
    return `${Math.round(v)} ${metricDef.unit}`;
  };

  const anchorPicker = (
    <Group gap="sm" align="center" wrap="wrap">
      <SegmentedControl
        size="xs"
        radius={0}
        value={anchorKind}
        onChange={setAnchorKind}
        data={[
          { value: 'ride', label: 'This ride' },
          { value: 'segment', label: 'Segment' },
        ]}
      />
      {anchorKind === 'segment' &&
        (segmentsLoading ? (
          <Loader size="xs" />
        ) : segmentOptions.length === 0 ? (
          <Text size="xs" c="dimmed">
            No segments in your library yet.
          </Text>
        ) : (
          <Select
            size="xs"
            radius={0}
            placeholder="Pick a segment"
            data={segmentOptions}
            value={segmentId}
            onChange={setSegmentId}
            searchable
            w={{ base: '100%', sm: 320 }}
            aria-label="Segment"
          />
        ))}
    </Group>
  );

  let empty = null;
  if (!anchor) {
    empty =
      anchorKind === 'ride'
        ? 'Pick a ride with GPS on the map card above to see its repeats.'
        : 'Pick a segment to see every ride along it.';
  } else if (efforts.length === 0) {
    empty = 'No rides along this path yet.';
  }

  return (
    <Box
      data-testid="repeats-tab"
      style={{ border: '0.5px solid var(--color-border)', backgroundColor: 'var(--color-card)' }}
    >
      <Box style={{ padding: '14px 16px 12px', borderBottom: '0.5px solid var(--color-border)' }}>
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <Box style={{ minWidth: 0 }}>
            <Text style={eyebrowStyle} mb={4}>
              Repeats
            </Text>
            {anchor ? (
              <>
                <Text fw={700} size="lg" lineClamp={1}>
                  {anchor.name}
                </Text>
                <Text size="xs" c="dimmed" style={mono}>
                  {efforts.length} {efforts.length === 1 ? 'ride' : 'rides'} · {formatDistance(anchor.lengthKm)}
                  {measuredCount > 0 && ` · ${measuredCount} with full data`}
                  {efforts.length > MAX_SELECTED && ` · up to ${MAX_SELECTED} overlaid at once`}
                </Text>
              </>
            ) : (
              <Text size="sm" c="dimmed">
                {empty}
              </Text>
            )}
          </Box>
          {anchorPicker}
        </Group>
      </Box>

      {anchor && empty && (
        <Text size="sm" c="dimmed" p="md">
          {empty}
        </Text>
      )}

      {anchor && !empty && (
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.45fr 1fr',
            alignItems: 'start',
          }}
        >
          <Box style={{ borderRight: isMobile ? 'none' : '0.5px solid var(--color-border)' }}>
            <RepeatsMap anchor={anchor} efforts={selectedEfforts} hoverX={hoverX} height={isMobile ? 280 : 420} />
            <Group justify="space-between" align="center" px="sm" py={6} wrap="wrap">
              <Text style={eyebrowStyle}>Trace</Text>
              {availableMetrics.length > 0 ? (
                <SegmentedControl
                  size="xs"
                  radius={0}
                  value={activeMetric}
                  onChange={setMetric}
                  data={availableMetrics.map((m) => ({ value: m.value, label: m.label }))}
                  aria-label="Trace metric"
                />
              ) : (
                <Text size="xs" c="dimmed">
                  No measured rides selected
                </Text>
              )}
            </Group>
            <RepeatsStrip
              series={series}
              metric={activeMetric}
              xMaxKm={anchor.lengthKm}
              elevationRows={elevationRows}
              hoverX={hoverX}
              onHoverX={setHoverX}
              height={isMobile ? 100 : 132}
            />
          </Box>

          <Stack gap={0} data-testid="repeats-list">
            {efforts.map((e) => {
              const selected = selectedSet.has(e.id);
              const readout = readoutFor(e);
              return (
                <Box
                  key={e.id}
                  data-testid={`repeat-row-${e.id}`}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '0.5px solid var(--color-border)',
                    opacity: selected ? 1 : 0.6,
                  }}
                >
                  <Group gap="sm" align="center" wrap="nowrap">
                    <Tooltip label={!selected && atCap ? `Up to ${MAX_SELECTED} at once` : selected ? 'Hide' : 'Show'}>
                      <Box>
                        <Swatch
                          color={e.color}
                          selected={selected}
                          onClick={() => toggle(e.id)}
                          label={`${selected ? 'Hide' : 'Show'} ${formatShortDate(e.startDate)}`}
                        />
                      </Box>
                    </Tooltip>
                    <Box style={{ minWidth: 0, flex: 1 }}>
                      <Group gap={6} align="center" wrap="nowrap">
                        <Text size="sm" fw={600} style={{ whiteSpace: 'nowrap' }}>
                          {formatShortDate(e.startDate)}
                        </Text>
                        {e.id === anchor.id && anchor.kind === 'ride' && (
                          <Badge size="xs" radius={0} variant="outline" color="gray">
                            anchor
                          </Badge>
                        )}
                        {bests.fastestId === e.id && (
                          <Badge size="xs" radius={0} color="teal">
                            fastest
                          </Badge>
                        )}
                        {bests.strongestId === e.id && bests.strongestId !== bests.fastestId && (
                          <Badge size="xs" radius={0} color="orange">
                            strongest
                          </Badge>
                        )}
                        {e.direction === 'reverse' && (
                          <Badge size="xs" radius={0} variant="light" color="gray">
                            reverse
                          </Badge>
                        )}
                        {!e.measured && (
                          <Badge size="xs" radius={0} variant="light" color="gray">
                            geometry only
                          </Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {e.name}
                      </Text>
                    </Box>
                    <Tooltip label="Full analysis">
                      <ActionIcon
                        variant="subtle"
                        radius={0}
                        size="sm"
                        aria-label={`Open ${formatShortDate(e.startDate)}`}
                        onClick={() => onOpenRide?.(e.ride)}
                      >
                        <ChartBar size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                  <Group gap="md" mt={6} wrap="wrap" style={{ paddingLeft: 26 }}>
                    <Stat label="TIME" value={formatDuration(e.stats.durationSeconds)} />
                    <Stat label="AVG W" value={e.stats.avgPower ?? '—'} />
                    <Stat label="AVG HR" value={e.stats.avgHr ?? '—'} />
                    <Stat label="SPEED" value={e.stats.avgSpeedKmh != null ? formatSpeed(e.stats.avgSpeedKmh) : '—'} />
                    {readout && (
                      <Text
                        data-testid={`repeat-readout-${e.id}`}
                        style={{ ...mono, fontSize: 11, color: e.color, alignSelf: 'flex-end' }}
                      >
                        {readout} at cursor
                      </Text>
                    )}
                  </Group>
                </Box>
              );
            })}
          </Stack>
        </Box>
      )}
    </Box>
  );
}

export default RepeatsTab;
