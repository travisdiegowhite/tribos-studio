/**
 * EffortsTable — every ride along the anchor as one sortable table. A row
 * is an effort: its identity colour, when it was, how long the stretch
 * took and at what power, heart rate and speed. The best time is marked;
 * clicking anywhere on a row shows or hides it on the map and traces.
 *
 * Runs read as runs: a run's effort shows pace (min/km or min/mi), never
 * km/h, and the power column is dropped when no effort has power — a list
 * of runs used to show a column of dashes under "Avg W" and speeds a runner
 * never reads. The date column stays pinned while the table scrolls
 * sideways on a phone.
 */

import { useMemo, useState } from 'react';
import { ActionIcon, Box, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { ArrowDown, ArrowUp, ChartBar } from '@phosphor-icons/react';
import { C, FONT } from '../../views/today-spine/tokens';
import { isRunningActivity } from '../../utils/sportType';
import { formatPace, speedToPaceSecPerKm } from '../../utils/paceFormat';

const mono = { fontFamily: FONT.mono };

export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

export function formatShortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

/** True when this effort is a run (its ride row says so). */
export function isRunEffort(effort) {
  return Boolean(effort?.ride) && isRunningActivity(effort.ride);
}

/**
 * The table's columns for these efforts: power only when some effort has it,
 * and "Pace" in place of "Speed" when every effort is a run (sorted fastest
 * first). A mixed list keeps a "Speed" column whose run rows show pace.
 */
export function columnsFor(efforts) {
  const allRuns = efforts.length > 0 && efforts.every(isRunEffort);
  const anyPower = efforts.some((e) => e.stats?.avgPower != null);
  return [
    { key: 'date', label: 'Date', align: 'left' },
    { key: 'time', label: 'Time', align: 'right' },
    ...(anyPower ? [{ key: 'power', label: 'Avg W', align: 'right' }] : []),
    { key: 'hr', label: 'Avg HR', align: 'right' },
    allRuns ? { key: 'pace', label: 'Pace', align: 'right' } : { key: 'speed', label: 'Speed', align: 'right' },
  ];
}

function sortValue(effort, key) {
  switch (key) {
    case 'date':
      return Date.parse(effort.startDate) || 0;
    case 'time':
      return effort.stats.durationSeconds;
    case 'power':
      return effort.stats.avgPower;
    case 'hr':
      return effort.stats.avgHr;
    case 'speed':
      return effort.stats.avgSpeedKmh;
    case 'pace':
      // Seconds per km: ascending is fastest first.
      return effort.stats.avgSpeedKmh > 0 ? 3600 / effort.stats.avgSpeedKmh : null;
    default:
      return null;
  }
}

/** Speed for a ride, pace for a run. */
function speedCell(effort, formatSpeed, isImperial) {
  const kmh = effort.stats.avgSpeedKmh;
  if (kmh == null) return '—';
  if (isRunEffort(effort)) return formatPace(speedToPaceSecPerKm(kmh / 3.6), isImperial);
  return formatSpeed(kmh);
}

/** Sort with nulls always last, whatever the direction. */
export function sortEfforts(efforts, key, dir) {
  const sign = dir === 'asc' ? 1 : -1;
  return efforts
    .map((e, i) => ({ e, i, v: sortValue(e, key) }))
    .sort((a, b) => {
      if (a.v == null && b.v == null) return a.i - b.i;
      if (a.v == null) return 1;
      if (b.v == null) return -1;
      return (a.v - b.v) * sign || a.i - b.i;
    })
    .map((x) => x.e);
}

function Tag({ children, color = C.text3 }) {
  return (
    <span
      style={{
        ...mono,
        fontSize: 10,
        letterSpacing: '1px',
        textTransform: 'uppercase',
        color,
        border: `1px solid ${color}`,
        padding: '1px 4px',
        marginLeft: 6,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/** Width of the show/hide column: a 40px tap target. */
const TOGGLE_W = 40;

/** Pinned while the table scrolls sideways (the date stays readable on a phone). */
const stickyAt = (left, background) => ({ position: 'sticky', left, zIndex: 1, background });

const cell = (align = 'left') => ({
  ...mono,
  fontSize: 12,
  padding: '9px 10px',
  textAlign: align,
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
});

/**
 * @param {object} props
 * @param {import('../../hooks/useRepeatsScan').ColoredEffort[]} props.efforts
 * @param {Set<string>} props.selectedSet
 * @param {{ fastestId: string|null, strongestId: string|null }} props.bests
 * @param {{ kind: string, id: string }} props.anchor
 * @param {boolean} props.atCap
 * @param {number} props.maxSelected
 * @param {(id: string) => void} props.onToggle
 * @param {(ride: object) => void} props.onOpen
 * @param {(kmh: number) => string} props.formatSpeed
 * @param {boolean} [props.isImperial]  Pace per mile rather than per km.
 * @param {(effort: object) => string|null} props.readoutFor  Metric value under the cursor, if any.
 */
export default function EffortsTable({
  efforts,
  selectedSet,
  bests,
  anchor,
  atCap,
  maxSelected,
  onToggle,
  onOpen,
  formatSpeed,
  isImperial = false,
  readoutFor,
}) {
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const columns = useMemo(() => columnsFor(efforts), [efforts]);
  const sorted = useMemo(() => sortEfforts(efforts, sort.key, sort.dir), [efforts, sort]);

  const setSortKey = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' ? 'desc' : 'asc' }));

  return (
    <Box style={{ overflowX: 'auto' }} data-testid="repeats-list">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            <th style={{ ...stickyAt(0, C.base), width: TOGGLE_W }} aria-label="Shown" />
            {columns.map((c) => {
              const active = sort.key === c.key;
              return (
                <th
                  key={c.key}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  style={{ ...cell(c.align), padding: '8px 10px', ...(c.key === 'date' ? stickyAt(TOGGLE_W, C.base) : null) }}
                >
                  <UnstyledButton
                    onClick={() => setSortKey(c.key)}
                    aria-label={`Sort by ${c.label.toLowerCase()}`}
                    style={{
                      ...mono,
                      fontSize: 11,
                      letterSpacing: '1.5px',
                      minHeight: 32,
                      textTransform: 'uppercase',
                      color: active ? C.text : C.text3,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {c.label}
                    {active && (sort.dir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                  </UnstyledButton>
                </th>
              );
            })}
            <th style={{ width: 44 }} aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => {
            const selected = selectedSet.has(e.id);
            const blocked = !selected && atCap;
            const date = formatShortDate(e.startDate);
            const readout = readoutFor?.(e);
            const isBest = bests.fastestId === e.id;
            const rowBg = selected ? C.card : C.base;
            const toggle = () => {
              if (!blocked) onToggle(e.id);
            };
            return (
              <tr
                key={e.id}
                data-testid={`repeat-row-${e.id}`}
                data-selected={selected ? 'true' : 'false'}
                onClick={toggle}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    toggle();
                  }
                }}
                tabIndex={0}
                aria-label={`${selected ? 'Hide' : 'Show'} ${date} on the map`}
                title={blocked ? `Up to ${maxSelected} at once` : undefined}
                style={{
                  borderBottom: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${isBest ? C.gold : 'transparent'}`,
                  background: rowBg,
                  opacity: selected ? 1 : 0.62,
                  cursor: blocked ? 'not-allowed' : 'pointer',
                }}
              >
                <td style={{ ...cell(), padding: 0, ...stickyAt(0, rowBg) }}>
                  {/* A 40px target around the 12px swatch. */}
                  <UnstyledButton
                    onClick={(ev) => {
                      ev.stopPropagation();
                      toggle();
                    }}
                    aria-label={`${selected ? 'Hide' : 'Show'} ${date}`}
                    aria-pressed={selected}
                    style={{ width: TOGGLE_W, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        display: 'block',
                        border: `2px solid ${e.color}`,
                        backgroundColor: selected ? e.color : 'transparent',
                      }}
                    />
                  </UnstyledButton>
                </td>
                <td style={{ ...cell(), fontWeight: 500, color: C.text, ...stickyAt(TOGGLE_W, rowBg) }}>
                  <span>{date}</span>
                  {anchor.kind === 'ride' && e.id === anchor.id && <Tag>anchor</Tag>}
                  {isBest && <Tag color={C.gold}>best time</Tag>}
                  {bests.strongestId === e.id && bests.strongestId !== bests.fastestId && <Tag color={C.orange}>strongest</Tag>}
                  {e.direction === 'reverse' && <Tag>reverse</Tag>}
                  {!e.measured && <Tag>geometry only</Tag>}
                  <Text
                    lineClamp={1}
                    style={{ fontFamily: FONT.body, fontSize: 11, color: C.text3, maxWidth: 260, whiteSpace: 'normal' }}
                  >
                    {e.name}
                  </Text>
                  {readout && (
                    <Text data-testid={`repeat-readout-${e.id}`} style={{ ...mono, fontSize: 10, color: e.color }}>
                      {readout} at cursor
                    </Text>
                  )}
                </td>
                <td style={{ ...cell('right'), fontWeight: isBest ? 600 : 400, color: isBest ? C.gold : C.text }}>
                  {formatDuration(e.stats.durationSeconds)}
                </td>
                {columns.some((c) => c.key === 'power') && <td style={cell('right')}>{e.stats.avgPower ?? '—'}</td>}
                <td style={cell('right')}>{e.stats.avgHr ?? '—'}</td>
                <td style={cell('right')} data-testid={`repeat-speed-${e.id}`}>{speedCell(e, formatSpeed, isImperial)}</td>
                <td style={{ ...cell(), padding: '2px 2px' }}>
                  <Tooltip label="Full analysis" withArrow>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      radius={0}
                      size={40}
                      aria-label={`Open ${date}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onOpen?.(e.ride);
                      }}
                    >
                      <ChartBar size={14} />
                    </ActionIcon>
                  </Tooltip>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Box>
  );
}
