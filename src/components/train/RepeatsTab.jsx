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

import { Component, useCallback, useEffect, useMemo, useState } from 'react';
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
import { useRepeatAnchorSegments } from '../../hooks/useRepeatAnchorSegments';
import {
  anchorFromRide,
  anchorFromSegment,
  createRepeatsScan,
  effortPointAt,
  repeatBests,
  repeatColor,
} from '../../utils/rideRepeats';
import RepeatsMap from './RepeatsMap';
import RepeatsStrip from './RepeatsStrip';

const MAX_SELECTED = 8;
const DEFAULT_SELECTED = 6;
/** Matching runs between frames in slices this long, so the page never freezes. */
const SCAN_SLICE_MS = 24;

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
 * A fault in this tab must never take the page down with it: the rest of
 * /train keeps working and the athlete gets a retry instead of a blank site.
 */
class RepeatsErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('REPEATS tab failed', error, info);
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(error, { extra: info });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <Box
          data-testid="repeats-error"
          style={{ border: '0.5px solid var(--color-border)', backgroundColor: 'var(--color-card)', padding: 16 }}
        >
          <Text style={eyebrowStyle} mb={6}>
            Repeats
          </Text>
          <Text size="sm" mb={10}>
            Repeats couldn't be drawn for this ride. The rest of the page is unaffected.
          </Text>
          <UnstyledButton onClick={() => this.setState({ error: null })} style={{ ...mono, fontSize: 11, letterSpacing: '1.5px', textDecoration: 'underline' }}>
            TRY AGAIN
          </UnstyledButton>
        </Box>
      );
    }
    return this.props.children;
  }
}

/**
 * Match `activities` against `anchor` in short slices between frames.
 * A history of thousands of rides used to be scanned in one synchronous
 * pass on click; now the page stays responsive and shows progress.
 */
function useRepeatsScan(anchor, activities) {
  const [state, setState] = useState({ efforts: [], done: true, processed: 0, total: 0 });

  useEffect(() => {
    const scan = createRepeatsScan(anchor, activities);
    let cancelled = false;
    let timer = null;
    const publish = () =>
      setState({
        efforts: scan.done ? scan.efforts.map((e, i) => ({ ...e, color: repeatColor(i) })) : [],
        done: scan.done,
        processed: scan.processed,
        total: scan.total,
      });
    const run = () => {
      if (cancelled) return;
      scan.step(SCAN_SLICE_MS);
      publish();
      if (!scan.done) timer = setTimeout(run, 0);
    };
    run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [anchor, activities]);

  return state;
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
function RepeatsTab(props) {
  return (
    <RepeatsErrorBoundary>
      <RepeatsTabInner {...props} />
    </RepeatsErrorBoundary>
  );
}

function RepeatsTabInner({ anchorRide, activities, userId, formatDistance, formatSpeed, onOpenRide }) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [anchorKind, setAnchorKind] = useState('ride');
  const [segmentId, setSegmentId] = useState(null);
  // null = "the default pick" (newest efforts) until the athlete changes it.
  const [selectedIds, setSelectedIds] = useState(null);
  const [metric, setMetric] = useState('power');
  const [hoverX, setHoverX] = useState(null);

  const {
    segments,
    loading: segmentsLoading,
    error: segmentsError,
  } = useRepeatAnchorSegments(userId, anchorKind === 'segment');

  const segmentOptions = useMemo(
    () =>
      segments.map((s) => ({
        value: s.id,
        label: `${s.display_name}${s.distance_meters ? ` · ${formatDistance(s.distance_meters / 1000)}` : ''} · ${s.ride_count} ${s.ride_count === 1 ? 'ride' : 'rides'}`,
      })),
    [segments, formatDistance],
  );

  // Entering segment mode lands on the most-ridden segment rather than an
  // empty picker; the athlete can change it from there.
  useEffect(() => {
    if (anchorKind === 'segment' && segmentId == null && segments.length > 0) {
      setSegmentId(segments[0].id);
    }
  }, [anchorKind, segmentId, segments]);

  const anchor = useMemo(() => {
    if (anchorKind === 'segment') {
      return anchorFromSegment(segments.find((s) => s.id === segmentId) ?? null);
    }
    return anchorFromRide(anchorRide);
  }, [anchorKind, anchorRide, segments, segmentId]);

  const scan = useRepeatsScan(anchor, activities);
  const efforts = scan.efforts;

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
        ) : segmentsError ? (
          <Text size="xs" c="red" data-testid="repeats-segments-error">
            Couldn't load your segments: {segmentsError}
          </Text>
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
  } else if (!scan.done) {
    empty = `Scanning ${scan.processed.toLocaleString()} of ${scan.total.toLocaleString()} rides…`;
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
        <Group gap="sm" p="md" align="center" data-testid="repeats-status">
          {!scan.done && <Loader size="xs" />}
          <Text size="sm" c="dimmed">
            {empty}
          </Text>
        </Group>
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
