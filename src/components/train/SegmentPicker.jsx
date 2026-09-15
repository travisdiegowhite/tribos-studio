/**
 * SegmentPicker — the athlete's training segments as a browsable grid, so
 * picking one to compare is a glance at shapes and ride counts rather than
 * a scroll through a dropdown of "Rolling 14.7km"s.
 *
 * Each card carries the segment's real shape (its stored geometry, drawn as
 * one SVG path), its distance and terrain, and how often it has been
 * ridden. Most-ridden first, because that is what "repeats" means. Names
 * are the athlete's to change inline; the detector's generic names can be
 * rebuilt from road names in one go with NAME MY SEGMENTS.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Box, Group, Loader, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { Check, PencilSimple, X } from '@phosphor-icons/react';
import { buildTraceGeometry } from '../../views/today-spine/beats/glyphs/RouteTrace';
import { C, FONT } from '../../views/today-spine/tokens';
import { isFiniteLngLat } from '../../utils/rideRepeats';

/** Cards shown before the athlete asks for the rest. */
const INITIAL_VISIBLE = 12;

const mono = { fontFamily: FONT.mono };
const eyebrow = { ...mono, fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', color: C.text3 };

const TERRAIN_LABEL = { climb: 'Climb', descent: 'Descent', rolling: 'Rolling', flat: 'Flat' };

export function formatLastRidden(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

/** The segment's shape as a small SVG, or nothing when the geometry is unusable. */
export function SegmentGlyph({ coords, height = 64, stroke = C.teal }) {
  const geometry = useMemo(() => {
    const clean = Array.isArray(coords) ? coords.filter(isFiniteLngLat) : [];
    return buildTraceGeometry(clean);
  }, [coords]);
  if (!geometry) return <Box style={{ height }} />;
  return (
    <Box style={{ height, width: '100%' }} data-testid="segment-glyph">
      <svg width="100%" height={height} viewBox={geometry.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <path
          d={geometry.d}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={geometry.start.x} cy={geometry.start.y} r={geometry.dotR} fill={C.navy} />
      </svg>
    </Box>
  );
}

function RenameField({ segment, onSubmit, onCancel, busy }) {
  const [value, setValue] = useState(segment.custom_name ?? (segment.generic ? '' : segment.display_name));
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
      <TextInput
        ref={inputRef}
        size="xs"
        radius={0}
        value={value}
        placeholder={segment.auto_name ?? 'Name this segment'}
        aria-label={`New name for ${segment.display_name}`}
        onChange={(e) => setValue(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit(value);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        disabled={busy}
        style={{ flex: 1, minWidth: 0 }}
        styles={{ input: { ...mono, fontSize: 12 } }}
      />
      <ActionIcon size="sm" radius={0} variant="filled" color="dark" aria-label="Save name" onClick={() => onSubmit(value)} loading={busy}>
        <Check size={12} weight="bold" />
      </ActionIcon>
      <ActionIcon size="sm" radius={0} variant="subtle" color="gray" aria-label="Cancel rename" onClick={onCancel} disabled={busy}>
        <X size={12} />
      </ActionIcon>
    </Group>
  );
}

function SegmentCard({ segment, selected, onSelect, formatDistance, editing, onEdit, onRename, onCancelEdit, busy }) {
  const distance = segment.distance_meters != null ? formatDistance(segment.distance_meters / 1000) : null;
  const terrain = TERRAIN_LABEL[segment.terrain_type] ?? null;
  const gradient =
    segment.avg_gradient != null && Math.abs(segment.avg_gradient) >= 0.5
      ? `${segment.avg_gradient > 0 ? '+' : ''}${segment.avg_gradient.toFixed(1)}%`
      : null;
  const last = formatLastRidden(segment.last_ridden_at);
  const rides = `${segment.ride_count} ${segment.ride_count === 1 ? 'ride' : 'rides'}`;

  return (
    <Box
      data-testid={`segment-card-${segment.id}`}
      data-selected={selected ? 'true' : 'false'}
      style={{
        position: 'relative',
        background: selected ? C.base : C.card,
        border: `1.5px solid ${selected ? C.gold : C.border}`,
        boxShadow: selected ? `inset 0 0 0 1px ${C.gold}` : 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <UnstyledButton
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Compare repeats of ${segment.display_name}`}
        style={{ display: 'block', padding: '12px 12px 8px', textAlign: 'left', flex: 1 }}
      >
        <SegmentGlyph coords={segment.geojson?.coordinates} stroke={selected ? C.gold : C.teal} />
        <Group gap={6} align="center" wrap="nowrap" mt={8}>
          {selected && <span style={{ width: 5, height: 5, background: C.gold, display: 'inline-block', flexShrink: 0 }} />}
          {editing ? null : (
            <Text
              lineClamp={2}
              style={{
                fontFamily: FONT.heading,
                fontSize: 17,
                lineHeight: 1.1,
                fontWeight: 600,
                color: segment.generic ? C.text3 : C.text,
                fontStyle: segment.generic ? 'italic' : 'normal',
              }}
            >
              {segment.display_name}
            </Text>
          )}
        </Group>
        <Text style={{ ...mono, fontSize: 10, letterSpacing: '1px', color: C.text2, marginTop: 6 }}>
          {[distance, terrain, gradient].filter(Boolean).join(' · ').toUpperCase()}
        </Text>
        <Text style={{ ...mono, fontSize: 10, letterSpacing: '1px', color: C.text3, marginTop: 2 }}>
          {[rides, last ? `last ${last}` : null].filter(Boolean).join(' · ').toUpperCase()}
        </Text>
      </UnstyledButton>

      {editing ? (
        <Box px={10} pb={10}>
          <RenameField segment={segment} onSubmit={onRename} onCancel={onCancelEdit} busy={busy} />
        </Box>
      ) : (
        <Tooltip label={segment.generic ? 'Give this segment a name' : 'Rename'} withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            radius={0}
            size="sm"
            aria-label={`Rename ${segment.display_name}`}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            style={{ position: 'absolute', top: 6, right: 6 }}
          >
            <PencilSimple size={13} />
          </ActionIcon>
        </Tooltip>
      )}
    </Box>
  );
}

/**
 * @param {object} props
 * @param {import('../../hooks/useRepeatAnchorSegments').RepeatAnchorSegment[]} props.segments
 * @param {string|null} props.selectedId
 * @param {(id: string) => void} props.onSelect
 * @param {(km: number) => string} props.formatDistance
 * @param {boolean} props.loading
 * @param {string|null} props.error
 * @param {import('../../hooks/useSegmentNamer').SegmentNamer} props.namer
 */
export default function SegmentPicker({ segments, selectedId, onSelect, formatDistance, loading, error, namer }) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return segments;
    return segments.filter(
      (s) =>
        s.display_name.toLowerCase().includes(q) ||
        (s.auto_name ?? '').toLowerCase().includes(q) ||
        (s.terrain_type ?? '').toLowerCase().includes(q),
    );
  }, [segments, query]);

  const visible = showAll || query ? filtered : filtered.slice(0, INITIAL_VISIBLE);
  const hidden = filtered.length - visible.length;
  const { progress } = namer;

  if (loading && segments.length === 0) {
    return (
      <Group gap="sm" p="md" align="center">
        <Loader size="xs" color={C.teal} />
        <Text style={{ ...mono, fontSize: 11, color: C.text3 }}>Loading your segments…</Text>
      </Group>
    );
  }
  if (error) {
    return (
      <Text p="md" style={{ ...mono, fontSize: 11, color: C.coral }} data-testid="repeats-segments-error">
        Couldn&apos;t load your segments: {error}
      </Text>
    );
  }
  if (segments.length === 0) {
    return (
      <Text p="md" style={{ ...mono, fontSize: 11, color: C.text3 }}>
        No segments in your library yet. They appear as your rides are analysed.
      </Text>
    );
  }

  return (
    <Box data-testid="segment-picker">
      <Group justify="space-between" align="center" wrap="wrap" gap="sm" px={16} py={10} style={{ borderBottom: `1px solid ${C.border}` }}>
        <Group gap="md" align="center" wrap="wrap">
          <TextInput
            size="xs"
            radius={0}
            placeholder="Find a segment"
            aria-label="Find a segment"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            w={{ base: '100%', sm: 220 }}
            styles={{ input: { ...mono, fontSize: 11, borderColor: C.border } }}
          />
          <Text style={eyebrow}>
            {filtered.length} {filtered.length === 1 ? 'segment' : 'segments'}
            {query ? ` of ${segments.length}` : ''}
          </Text>
        </Group>
        {progress.running ? (
          <Group gap={10} align="center" data-testid="segment-naming-progress">
            <Loader size="xs" color={C.gold} />
            <Text style={{ ...eyebrow, color: C.text }}>
              Naming {Math.min(progress.done + 1, progress.total)} of {progress.total}
              {progress.named > 0 ? ` · ${progress.named} named` : ''}
            </Text>
            <UnstyledButton onClick={namer.stop} style={{ ...eyebrow, color: C.coral, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Stop
            </UnstyledButton>
          </Group>
        ) : namer.unnamedCount > 0 ? (
          <Group gap={10} align="center">
            {progress.error && (
              <Text style={{ ...eyebrow, color: C.coral }} data-testid="segment-naming-error">
                {progress.error}
              </Text>
            )}
            {progress.total > 0 && !progress.error && (
              <Text style={eyebrow} data-testid="segment-naming-summary">
                {progress.named} of {progress.done} named
              </Text>
            )}
            <UnstyledButton
              onClick={namer.nameAll}
              style={{
                ...mono,
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                color: C.card,
                background: C.navy,
                padding: '7px 12px',
              }}
            >
              Name my segments ({namer.unnamedCount})
            </UnstyledButton>
          </Group>
        ) : progress.total > 0 ? (
          <Text style={eyebrow} data-testid="segment-naming-summary">
            {progress.named} of {progress.done} named
          </Text>
        ) : null}
      </Group>

      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 10,
          padding: 12,
        }}
      >
        {visible.map((s) => (
          <SegmentCard
            key={s.id}
            segment={s}
            selected={s.id === selectedId}
            onSelect={() => onSelect(s.id)}
            formatDistance={formatDistance}
            editing={editingId === s.id}
            onEdit={() => setEditingId(s.id)}
            onCancelEdit={() => setEditingId(null)}
            onRename={async (name) => {
              try {
                await namer.rename(s.id, name);
                setEditingId(null);
              } catch {
                /* the field stays open with the athlete's text; the hook reports the error */
              }
            }}
            busy={namer.renaming === s.id}
          />
        ))}
      </Box>
      {filtered.length === 0 && (
        <Text px={16} pb={12} style={{ ...mono, fontSize: 11, color: C.text3 }}>
          Nothing matches &quot;{query}&quot;.
        </Text>
      )}
      {hidden > 0 && (
        <Box px={16} pb={12}>
          <UnstyledButton
            onClick={() => setShowAll(true)}
            style={{ ...eyebrow, color: C.teal, textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            Show all {filtered.length}
          </UnstyledButton>
        </Box>
      )}
    </Box>
  );
}
