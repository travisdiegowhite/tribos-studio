/**
 * EffortsTable — every ride along the anchor as one sortable table. A row
 * is an effort: its identity colour, when it was, how long the stretch
 * took and at what power, heart rate and speed. The best time is marked;
 * clicking anywhere on a row shows or hides it on the map and traces.
 */

import { useMemo, useState } from 'react';
import { ActionIcon, Box, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { ArrowDown, ArrowUp, ChartBar } from '@phosphor-icons/react';
import { C, FONT } from '../../views/today-spine/tokens';

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

const COLUMNS = [
  { key: 'date', label: 'Date', align: 'left' },
  { key: 'time', label: 'Time', align: 'right' },
  { key: 'power', label: 'Avg W', align: 'right' },
  { key: 'hr', label: 'Avg HR', align: 'right' },
  { key: 'speed', label: 'Speed', align: 'right' },
];

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
    default:
      return null;
  }
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
        fontSize: 8,
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
  readoutFor,
}) {
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const sorted = useMemo(() => sortEfforts(efforts, sort.key, sort.dir), [efforts, sort]);

  const setSortKey = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' ? 'desc' : 'asc' }));

  return (
    <Box style={{ overflowX: 'auto' }} data-testid="repeats-list">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            <th style={{ width: 26 }} aria-label="Shown" />
            {COLUMNS.map((c) => {
              const active = sort.key === c.key;
              return (
                <th
                  key={c.key}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  style={{ ...cell(c.align), padding: '8px 10px' }}
                >
                  <UnstyledButton
                    onClick={() => setSortKey(c.key)}
                    aria-label={`Sort by ${c.label.toLowerCase()}`}
                    style={{
                      ...mono,
                      fontSize: 9,
                      letterSpacing: '1.5px',
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
            <th style={{ width: 34 }} aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => {
            const selected = selectedSet.has(e.id);
            const blocked = !selected && atCap;
            const date = formatShortDate(e.startDate);
            const readout = readoutFor?.(e);
            const isBest = bests.fastestId === e.id;
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
                  background: selected ? C.card : C.base,
                  opacity: selected ? 1 : 0.62,
                  cursor: blocked ? 'not-allowed' : 'pointer',
                }}
              >
                <td style={{ ...cell(), padding: '9px 4px 9px 8px' }}>
                  <UnstyledButton
                    onClick={(ev) => {
                      ev.stopPropagation();
                      toggle();
                    }}
                    aria-label={`${selected ? 'Hide' : 'Show'} ${date}`}
                    aria-pressed={selected}
                    style={{
                      width: 12,
                      height: 12,
                      display: 'block',
                      border: `2px solid ${e.color}`,
                      backgroundColor: selected ? e.color : 'transparent',
                    }}
                  />
                </td>
                <td style={{ ...cell(), fontWeight: 500, color: C.text }}>
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
                <td style={cell('right')}>{e.stats.avgPower ?? '—'}</td>
                <td style={cell('right')}>{e.stats.avgHr ?? '—'}</td>
                <td style={cell('right')}>{e.stats.avgSpeedKmh != null ? formatSpeed(e.stats.avgSpeedKmh) : '—'}</td>
                <td style={{ ...cell(), padding: '4px 6px' }}>
                  <Tooltip label="Full analysis" withArrow>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      radius={0}
                      size="sm"
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
