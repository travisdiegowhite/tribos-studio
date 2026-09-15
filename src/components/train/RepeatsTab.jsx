/**
 * RepeatsTab — the REPEATS tab on /train: every ride that repeats an anchor
 * path, overlaid on one map with their metric traces aligned by distance
 * along the anchor, and a table of the efforts to pick from.
 *
 * Three zones, in the Today page's idiom (numbered mono eyebrows, gold
 * squares, zero radius):
 *   01 WHAT TO COMPARE — the anchor: the ride on the map card above, or a
 *      segment from the athlete's library picked from a grid of shapes.
 *   02 ON THE MAP — a tall map of every effort, then their traces of one
 *      metric against distance along the anchor, with axes and a legend.
 *   03 EFFORTS — a sortable table; a row toggles its ride on and off.
 *
 * Matching and alignment are pure (src/utils/rideRepeats.ts) and run in a
 * Web Worker over the rides /train already holds — no new reads.
 */

import { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Group, Loader, Stack, Text, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useRepeatAnchorSegments } from '../../hooks/useRepeatAnchorSegments';
import { useRepeatsScan } from '../../hooks/useRepeatsScan';
import { useSegmentNamer } from '../../hooks/useSegmentNamer';
import { anchorFromRide, anchorFromSegment, effortPointAt, repeatBests } from '../../utils/rideRepeats';
import { C, FONT } from '../../views/today-spine/tokens';
import EffortsTable, { formatDuration, formatShortDate } from './EffortsTable';
import RepeatsMap from './RepeatsMap';
import RepeatsStrip from './RepeatsStrip';
import SegmentPicker from './SegmentPicker';

export { formatDuration };

const MAX_SELECTED = 8;
const DEFAULT_SELECTED = 6;

const METRIC_OPTIONS = [
  { value: 'power', label: 'POWER', key: 'power', unit: 'W' },
  { value: 'heartRate', label: 'HEART RATE', key: 'heartRate', unit: 'bpm' },
  { value: 'speed', label: 'SPEED', key: 'speed_kmh', unit: 'km/h' },
];

const mono = { fontFamily: FONT.mono };
const eyebrowStyle = { ...mono, fontSize: 10, fontWeight: 500, letterSpacing: '2px', textTransform: 'uppercase', color: C.text3 };
const noteStyle = { ...mono, fontSize: 11, letterSpacing: '0.5px', color: C.text3 };

/** A header tab in the zone-card style: mono caps, gold underline when active. */
function ViewTab({ active, onClick, children, disabled = false }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: `2px solid ${active ? C.gold : 'transparent'}`,
        padding: '2px 0 3px',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: FONT.mono,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '1.5px',
        color: active ? C.text : C.text3,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </Box>
  );
}

/** One numbered zone card, the Today page's building block. */
function Zone({ number, title, right, children, testId }) {
  return (
    <Box
      data-testid={testId}
      style={{
        background: C.card,
        border: `1.5px solid ${C.border}`,
        boxShadow: '0 1px 3px rgba(20,16,8,.07),0 4px 12px rgba(20,16,8,.05)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" align="center" wrap="wrap" gap="sm" style={{ padding: '13px 16px 11px', borderBottom: `1px solid ${C.border}` }}>
        <Group gap={9} align="center" wrap="nowrap">
          <Text style={{ ...mono, fontSize: 10, fontWeight: 500, letterSpacing: '2px', color: C.text3 }}>{number}</Text>
          <span style={{ width: 5, height: 5, background: C.gold, display: 'inline-block' }} />
          <Text style={{ ...mono, fontSize: 11, fontWeight: 500, letterSpacing: '2px', color: C.text }}>{title}</Text>
        </Group>
        {right}
      </Group>
      {children}
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
        <Box data-testid="repeats-error" style={{ border: `1.5px solid ${C.border}`, backgroundColor: C.card, padding: 16 }}>
          <Text style={eyebrowStyle} mb={6}>
            Repeats
          </Text>
          <Text size="sm" mb={10}>
            Repeats couldn&apos;t be drawn for this ride. The rest of the page is unaffected.
          </Text>
          <UnstyledButton
            onClick={() => this.setState({ error: null })}
            style={{ ...mono, fontSize: 11, letterSpacing: '1.5px', textDecoration: 'underline' }}
          >
            TRY AGAIN
          </UnstyledButton>
        </Box>
      );
    }
    return this.props.children;
  }
}

/**
 * @param {object} props
 * @param {object|null} props.anchorRide   The ride on the map card (anchor for "this ride").
 * @param {object[]} props.activities      Every visible activity row.
 * @param {string|undefined} props.userId
 * @param {string|null} [props.initialSegmentId]  Open anchored on this segment (the ?segment= deep link).
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

function RepeatsTabInner({ anchorRide, activities, userId, initialSegmentId = null, formatDistance, formatSpeed, onOpenRide }) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [anchorKind, setAnchorKind] = useState(initialSegmentId ? 'segment' : 'ride');
  const [segmentId, setSegmentId] = useState(initialSegmentId);
  // null = "the default pick" (newest efforts) until the athlete changes it.
  const [selectedIds, setSelectedIds] = useState(null);
  const [metric, setMetric] = useState('power');
  const [hoverX, setHoverX] = useState(null);

  // A deep link that arrives after mount (the ride modal's "compare repeats").
  useEffect(() => {
    if (initialSegmentId) {
      setAnchorKind('segment');
      setSegmentId(initialSegmentId);
    }
  }, [initialSegmentId]);

  const library = useRepeatAnchorSegments(userId, anchorKind === 'segment');
  const { segments } = library;
  const namer = useSegmentNamer(segments, library.patch);

  // Entering segment mode lands on the most-ridden segment rather than an
  // empty grid; the athlete can change it from there.
  useEffect(() => {
    if (anchorKind === 'segment' && segments.length > 0 && !segments.some((s) => s.id === segmentId)) {
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
    () => METRIC_OPTIONS.filter((m) => selectedEfforts.some((e) => e.rows?.some((r) => r[m.key] != null))),
    [selectedEfforts],
  );
  const activeMetric = availableMetrics.some((m) => m.value === metric) ? metric : (availableMetrics[0]?.value ?? 'power');
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

  const anchorRideDate = anchorRide?.start_date ? formatShortDate(anchorRide.start_date) : null;

  const rideDescription = anchorRide ? (
    <Group gap="md" align="baseline" wrap="wrap" px={16} py={14}>
      <Text lineClamp={1} style={{ fontFamily: FONT.heading, fontSize: 22, fontWeight: 600, lineHeight: 1.1, color: C.text }}>
        {anchor?.name ?? anchorRide.name}
      </Text>
      <Text style={noteStyle}>
        {[anchorRideDate, anchor ? formatDistance(anchor.lengthKm) : null].filter(Boolean).join(' · ').toUpperCase()}
      </Text>
      <Text style={noteStyle}>Step through rides with the arrows on the map card, or pick one from HISTORY.</Text>
    </Group>
  ) : (
    <Text px={16} py={14} style={noteStyle}>
      {empty}
    </Text>
  );

  const mapSummary = anchor
    ? [
        `${efforts.length} ${efforts.length === 1 ? 'ride' : 'rides'}`,
        formatDistance(anchor.lengthKm),
        measuredCount > 0 ? `${measuredCount} with full data` : null,
        scan.done && efforts.length > 0 ? `${selectedEfforts.length} shown` : null,
      ]
        .filter(Boolean)
        .join(' · ')
        .toUpperCase()
    : '';

  return (
    <Stack gap={16} data-testid="repeats-tab">
      <Zone
        number="01"
        title="WHAT TO COMPARE"
        testId="repeats-zone-anchor"
        right={
          <Group gap={14} align="center">
            <ViewTab active={anchorKind === 'ride'} onClick={() => setAnchorKind('ride')}>
              THIS RIDE
            </ViewTab>
            <ViewTab active={anchorKind === 'segment'} onClick={() => setAnchorKind('segment')}>
              SEGMENT
            </ViewTab>
          </Group>
        }
      >
        {anchorKind === 'ride' ? (
          rideDescription
        ) : (
          <SegmentPicker
            segments={segments}
            selectedId={segmentId}
            onSelect={setSegmentId}
            formatDistance={formatDistance}
            loading={library.loading}
            error={library.error}
            namer={namer}
          />
        )}
      </Zone>

      {anchor && (
        <Zone
          number="02"
          title="ON THE MAP"
          testId="repeats-zone-map"
          right={
            <Text style={{ ...mono, fontSize: 10, letterSpacing: '1px', color: C.text3 }} lineClamp={1}>
              {mapSummary}
            </Text>
          }
        >
          <Text px={16} pt={12} lineClamp={1} style={{ fontFamily: FONT.heading, fontSize: 20, fontWeight: 600, lineHeight: 1.1, color: C.text }}>
            {anchor.name}
          </Text>
          {empty ? (
            <Group gap="sm" px={16} py={14} align="center" data-testid="repeats-status">
              {!scan.done && <Loader size="xs" color={C.teal} />}
              <Text style={noteStyle}>{empty}</Text>
            </Group>
          ) : (
            <>
              <Box mt={10}>
                <RepeatsMap anchor={anchor} efforts={selectedEfforts} hoverX={hoverX} height={isMobile ? 300 : 520} />
              </Box>

              <Group justify="space-between" align="center" wrap="wrap" gap="sm" px={16} py={10} style={{ borderTop: `1px solid ${C.border}` }}>
                <Text style={eyebrowStyle}>Traces · distance along the {anchor.kind === 'segment' ? 'segment' : 'ride'}</Text>
                {availableMetrics.length > 0 ? (
                  <Group gap={14} align="center" role="group" aria-label="Trace metric">
                    {availableMetrics.map((m) => (
                      <ViewTab key={m.value} active={activeMetric === m.value} onClick={() => setMetric(m.value)}>
                        {m.label}
                      </ViewTab>
                    ))}
                  </Group>
                ) : (
                  <Text style={noteStyle}>No measured rides shown</Text>
                )}
              </Group>
              <RepeatsStrip
                series={series}
                metric={activeMetric}
                unit={metricDef?.unit ?? ''}
                xMaxKm={anchor.lengthKm}
                elevationRows={elevationRows}
                hoverX={hoverX}
                onHoverX={setHoverX}
                height={isMobile ? 150 : 220}
              />
              <Group gap="md" wrap="wrap" px={16} py={10} style={{ borderTop: `1px solid ${C.border}` }} data-testid="repeats-legend">
                {selectedEfforts.map((e) => {
                  const readout = readoutFor(e);
                  return (
                    <Group key={e.id} gap={6} align="center" wrap="nowrap">
                      <span style={{ width: 10, height: 10, background: e.color, display: 'inline-block', flexShrink: 0 }} />
                      <Text style={{ ...mono, fontSize: 10, letterSpacing: '0.5px', color: C.text2 }}>
                        {formatShortDate(e.startDate)}
                        {!e.rows && ' · no trace'}
                        {readout && <span style={{ color: e.color }}> {readout}</span>}
                      </Text>
                    </Group>
                  );
                })}
                {selectedEfforts.length === 0 && <Text style={noteStyle}>Pick rides in the table below to draw them.</Text>}
              </Group>
            </>
          )}
        </Zone>
      )}

      {anchor && !empty && (
        <Zone
          number="03"
          title="EFFORTS"
          testId="repeats-zone-efforts"
          right={
            <Text style={{ ...mono, fontSize: 10, letterSpacing: '1px', color: C.text3 }}>
              {efforts.length > MAX_SELECTED ? `UP TO ${MAX_SELECTED} SHOWN AT ONCE · ` : ''}CLICK A ROW TO SHOW OR HIDE IT
            </Text>
          }
        >
          <EffortsTable
            efforts={efforts}
            selectedSet={selectedSet}
            bests={bests}
            anchor={anchor}
            atCap={atCap}
            maxSelected={MAX_SELECTED}
            onToggle={toggle}
            onOpen={onOpenRide}
            formatSpeed={formatSpeed}
            readoutFor={readoutFor}
          />
        </Zone>
      )}
    </Stack>
  );
}

export default RepeatsTab;
