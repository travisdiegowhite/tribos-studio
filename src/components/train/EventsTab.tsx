/**
 * Train → Find an event: browse the curated event catalog and add an event to the season.
 *
 * Reads event_catalog (migrations 130/131), which a weekly cron re-checks
 * against organizer sites (api/event-catalog-refresh.js). Every date carries
 * its status: most are projections and must never look official.
 * "Add to season" opens the race form prefilled; nothing is saved until the
 * rider saves it. See docs/event-catalog.md.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Anchor,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  Menu,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { getTodayString } from '../../utils/dateUtils';
import RaceGoalModal from '../RaceGoalModal';
import type { RacePrefill } from '../../lib/season/raceSearch';
import {
  EMPTY_FILTERS,
  EVENT_TYPES,
  REGIONS,
  dateText,
  distancesText,
  eventToPrefill,
  fetchUpcomingEvents,
  filterEvents,
  formatMonth,
  groupByMonth,
  monthsOf,
  statesOf,
  statusText,
  type CatalogEvent,
  type DistanceBucket,
  type EventFilters,
} from '../../lib/events/eventCatalog';

const display: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.01em',
  lineHeight: 1,
};
const mono: CSSProperties = { fontFamily: 'var(--font-mono)' };

/** Rows rendered before "Show more", so a phone isn't handed 500 rows at once. */
const PAGE = 120;

const STATUS_STYLE: Record<CatalogEvent['date_status'], CSSProperties> = {
  confirmed: { color: 'var(--color-ink)', border: '1px solid var(--color-ink)' },
  partial: { color: 'var(--color-easy)', border: '1px solid var(--color-easy)' },
  est: { color: 'var(--color-easy)', border: '1px dashed var(--color-easy)' },
  risk: { color: 'var(--color-signal-text)', border: '1px solid var(--color-signal-text)' },
};

function StatusChip({ event }: { event: CatalogEvent }) {
  return (
    <span
      style={{
        ...mono,
        ...STATUS_STYLE[event.date_status],
        display: 'inline-block',
        fontSize: 11,
        lineHeight: 1.2,
        padding: '1px 5px',
        whiteSpace: 'nowrap',
      }}
    >
      {statusText(event)}
    </span>
  );
}

const nameDateKey = (name: string, date: string) => `${name.trim().toLowerCase()}|${date}`;

function EventRow({
  event,
  isImperial,
  inSeason,
  onAdd,
}: {
  event: CatalogEvent;
  isImperial: boolean;
  inSeason: boolean;
  onAdd: (event: CatalogEvent, distanceMi: number | null) => void;
}) {
  const facts = [
    [event.city, event.state].filter(Boolean).join(', '),
    event.event_type,
    distancesText(event, isImperial),
  ].filter(Boolean);
  const options = event.distances_mi;
  return (
    <Box style={{ borderBottom: '1px solid var(--color-border)', paddingBlock: 10 }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Box style={{ minWidth: 0 }}>
          <Group gap={8} wrap="wrap" align="center">
            <Text size="sm" style={mono}>
              {dateText(event)}
            </Text>
            <StatusChip event={event} />
          </Group>
          <Text fw={700} mt={2}>
            {event.name}
          </Text>
          <Text size="xs" c="var(--color-text-secondary)" style={mono}>
            {facts.join(' · ')}
          </Text>
          {(event.series || event.notes) && (
            <Text size="xs" mt={2} c="var(--color-text-muted)">
              {[event.series, event.notes].filter(Boolean).join(' · ')}
            </Text>
          )}
        </Box>
        <Stack gap={6} align="flex-end" style={{ flexShrink: 0 }}>
          {inSeason ? (
            <Text size="xs" fw={600} c="var(--color-text-secondary)">
              In your season
            </Text>
          ) : options.length > 1 ? (
            <Menu position="bottom-end" radius={0} withinPortal>
              <Menu.Target>
                <Button radius={0} size="xs" variant="outline">
                  Add to season
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Which distance?</Menu.Label>
                {options.map((mi) => (
                  <Menu.Item key={mi} onClick={() => onAdd(event, mi)} style={mono}>
                    {isImperial ? `${Math.round(mi)} mi` : `${Math.round(mi * 1.609344)} km`}
                  </Menu.Item>
                ))}
                <Menu.Item onClick={() => onAdd(event, null)}>Decide later</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : (
            <Button radius={0} size="xs" variant="outline" onClick={() => onAdd(event, options[0] ?? null)}>
              Add to season
            </Button>
          )}
          {event.url && (
            <Anchor href={event.url} target="_blank" rel="noopener noreferrer" size="xs">
              Event site
            </Anchor>
          )}
        </Stack>
      </Group>
    </Box>
  );
}

export default function EventsTab({ isImperial = false }: { isImperial?: boolean }) {
  const { user } = useAuth();
  const today = getTodayString();
  const [events, setEvents] = useState<CatalogEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<EventFilters>(EMPTY_FILTERS);
  const [shown, setShown] = useState(PAGE);
  const [form, setForm] = useState<'new' | RacePrefill | null>(null);
  // The rider's upcoming races, to mark events already in their season.
  const [seasonKeys, setSeasonKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void fetchUpcomingEvents(today).then(({ events: rows, error: err }) => {
      if (cancelled) return;
      setEvents(rows);
      setError(err);
    });
    return () => {
      cancelled = true;
    };
  }, [today]);

  const loadSeason = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('race_goals').select('name, race_date').eq('user_id', user.id).gte('race_date', today);
    setSeasonKeys(new Set((data ?? []).map((r: { name: string; race_date: string }) => nameDateKey(r.name, r.race_date))));
  }, [user?.id, today]);
  useEffect(() => {
    void loadSeason();
  }, [loadSeason]);

  const set = (patch: Partial<EventFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setShown(PAGE);
  };

  const all = useMemo(() => events ?? [], [events]);
  const filtered = useMemo(() => filterEvents(all, filters), [all, filters]);
  const groups = useMemo(() => groupByMonth(filtered.slice(0, shown)), [filtered, shown]);
  const months = useMemo(() => monthsOf(all), [all]);
  const states = useMemo(() => statesOf(all), [all]);
  const lastChecked = useMemo(
    () => all.reduce<string | null>((max, e) => (e.last_checked_at && (!max || e.last_checked_at > max) ? e.last_checked_at : max), null),
    [all],
  );
  const filtering = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const unit = isImperial ? 'mi' : 'km';
  const distanceLabels: Record<DistanceBucket, string> = isImperial
    ? { any: 'Any', short: '<50', mid: '50–100', long: '100–200', ultra: '200+' }
    : { any: 'Any', short: '<80', mid: '80–160', long: '160–320', ultra: '320+' };

  if (events === null) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  return (
    <Stack gap="lg" py="md">
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <Box>
          <Text component="h2" m={0} style={{ ...display, fontSize: 32 }}>
            Find an event
          </Text>
          <Text size="sm" c="var(--color-text-secondary)" mt={6}>
            US gravel events for the coming season. Most dates are estimates from last year until the organizer
            announces them.
          </Text>
        </Box>
        <Button radius={0} size="sm" variant="subtle" onClick={() => setForm('new')}>
          Add an event that&apos;s not listed
        </Button>
      </Group>

      <Stack gap="xs">
        <TextInput
          radius={0}
          placeholder="Search by name, town or series"
          value={filters.query}
          onChange={(e) => set({ query: e.currentTarget.value })}
          aria-label="Search events"
        />
        <Group gap="xs" wrap="wrap">
          <Select
            radius={0}
            size="xs"
            placeholder="Region"
            data={[...REGIONS]}
            value={filters.region}
            onChange={(v) => set({ region: v })}
            clearable
            w={150}
            aria-label="Region"
          />
          <Select
            radius={0}
            size="xs"
            placeholder="State"
            data={states}
            value={filters.state}
            onChange={(v) => set({ state: v })}
            clearable
            searchable
            w={100}
            aria-label="State"
          />
          <Select
            radius={0}
            size="xs"
            placeholder="Month"
            data={months.map((m) => ({ value: m, label: formatMonth(m) }))}
            value={filters.month}
            onChange={(v) => set({ month: v })}
            clearable
            w={150}
            aria-label="Month"
          />
          <Select
            radius={0}
            size="xs"
            placeholder="Type"
            data={[...EVENT_TYPES]}
            value={filters.type}
            onChange={(v) => set({ type: v })}
            clearable
            w={140}
            aria-label="Event type"
          />
        </Group>
        <Group gap="md" wrap="wrap" align="center">
          <Group gap={6} wrap="nowrap" align="center">
            <Text size="xs" c="var(--color-text-secondary)">
              Distance ({unit})
            </Text>
            <SegmentedControl
              radius={0}
              size="xs"
              value={filters.distance}
              onChange={(v) => set({ distance: v as DistanceBucket })}
              data={(Object.keys(distanceLabels) as DistanceBucket[]).map((value) => ({ value, label: distanceLabels[value] }))}
            />
          </Group>
          <Checkbox
            size="xs"
            radius={0}
            label="Confirmed dates only"
            checked={filters.confirmedOnly}
            onChange={(e) => set({ confirmedOnly: e.currentTarget.checked })}
          />
        </Group>
      </Stack>

      <Group justify="space-between" align="center">
        <Text size="sm" c="var(--color-text-secondary)" style={mono}>
          {filtered.length} of {all.length} events
        </Text>
        {filtering && (
          <Button radius={0} size="xs" variant="subtle" onClick={() => set(EMPTY_FILTERS)}>
            Clear filters
          </Button>
        )}
      </Group>

      {error && (
        <Text size="sm" c="var(--color-signal-text)" role="alert">
          Couldn&apos;t load events: {error}
        </Text>
      )}
      {!error && all.length === 0 && (
        <Box style={{ border: '1px solid var(--color-border)', padding: 20 }}>
          <Text fw={700}>No events listed yet.</Text>
          <Text size="sm" c="var(--color-text-secondary)" mt={4}>
            You can still add your own event to the season.
          </Text>
        </Box>
      )}
      {all.length > 0 && filtered.length === 0 && (
        <Text size="sm" c="var(--color-text-secondary)">
          No events match. Try fewer filters, or add the event yourself.
        </Text>
      )}

      {groups.map(([month, list]) => (
        <Box key={month}>
          <Text component="h3" m={0} style={{ ...display, fontSize: 20 }} pb={6}>
            {formatMonth(month)}
          </Text>
          <Box style={{ borderTop: '1px solid var(--color-ink)' }}>
            {list.map((e) => (
              <EventRow
                key={e.id}
                event={e}
                isImperial={isImperial}
                inSeason={seasonKeys.has(nameDateKey(e.name, e.event_date))}
                onAdd={(ev, mi) => setForm(eventToPrefill(ev, mi))}
              />
            ))}
          </Box>
        </Box>
      ))}
      {filtered.length > shown && (
        <Button radius={0} variant="outline" onClick={() => setShown((n) => n + PAGE)} style={{ alignSelf: 'center' }}>
          Show more ({filtered.length - shown} left)
        </Button>
      )}

      <Text size="xs" c="var(--color-text-muted)">
        Dates are re-checked against organizer sites every week
        {lastChecked ? `; the last check ran ${lastChecked.slice(0, 10)}` : ''}. Not every event is listed: some states
        are thin, so add yours if it&apos;s missing.
      </Text>

      {form !== null && (
        <RaceGoalModal
          opened
          onClose={() => setForm(null)}
          raceGoal={form === 'new' ? null : form}
          isImperial={isImperial}
          onSaved={() => {
            setForm(null);
            void loadSeason();
          }}
        />
      )}
    </Stack>
  );
}
