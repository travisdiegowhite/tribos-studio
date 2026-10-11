/**
 * "Add race" on the Season tab: find a race by name before filling in the form.
 *
 * Typing searches the shared race directory (races other athletes saved).
 * Search (or Enter) also asks the web when the directory has fewer than 3
 * matches; web results are marked Unconfirmed with their source. Picking one
 * opens the race form prefilled; nothing is saved until the athlete saves it.
 * See docs/season-planner-build-plan.md (Race search).
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Anchor, Box, Button, Group, Loader, Modal, Stack, Text, TextInput } from '@mantine/core';
import { formatSeasonDate } from '../../lib/season/engine';
import {
  searchDirectory,
  searchWeb,
  type DirectoryRace,
  type FoundRace,
  type WebRace,
} from '../../lib/season/raceSearch';
import { RACE_TYPE_MAP } from '../../utils/raceTypes';

/** Fewer directory matches than this and Search also asks the web. */
const WEB_FALLBACK_BELOW = 3;
const DEBOUNCE_MS = 300;

const mono: CSSProperties = { fontFamily: 'var(--font-mono)' };

function distanceText(km: number | null, isImperial: boolean) {
  if (km === null) return null;
  return isImperial ? `${Math.round(km * 0.621371)} mi` : `${Math.round(km)} km`;
}

function ResultRow({
  found,
  isImperial,
  onPick,
}: {
  found: FoundRace;
  isImperial: boolean;
  onPick: (found: FoundRace) => void;
}) {
  const r = found.race;
  const facts = [
    formatSeasonDate(r.race_date),
    r.location,
    r.race_type ? RACE_TYPE_MAP[r.race_type as keyof typeof RACE_TYPE_MAP] ?? null : null,
    distanceText(r.distance_km, isImperial),
  ].filter(Boolean);
  const web = found.kind === 'web' ? (found.race as WebRace) : null;
  return (
    <Box style={{ borderBottom: '1px solid var(--color-border)', paddingBlock: 10 }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Box style={{ minWidth: 0 }}>
          <Text fw={700}>{r.name}</Text>
          <Text size="xs" c="var(--color-text-secondary)" style={mono}>
            {facts.join(' · ')}
          </Text>
          {web ? (
            <Text size="xs" mt={2} c="var(--color-text-muted)">
              Unconfirmed · from{' '}
              <Anchor href={web.url} target="_blank" rel="noopener noreferrer" size="xs">
                {web.site}
              </Anchor>
              {web.date_status === 'estimated_from_last_year' && " · date not announced yet: last year's date"}
            </Text>
          ) : (
            <Text size="xs" mt={2} c="var(--color-text-muted)">
              Confirmed by {(r as DirectoryRace).confirmed_count} athlete{(r as DirectoryRace).confirmed_count === 1 ? '' : 's'}
            </Text>
          )}
          {web?.note && (
            <Text size="xs" mt={2} c="var(--color-text-secondary)">
              {web.note}
            </Text>
          )}
        </Box>
        <Button radius={0} size="xs" variant="outline" style={{ flexShrink: 0 }} onClick={() => onPick(found)}>
          Use this
        </Button>
      </Group>
    </Box>
  );
}

export default function RaceSearchModal({
  todayLocal,
  isImperial = false,
  onClose,
  onPick,
  onManual,
}: {
  todayLocal: string;
  isImperial?: boolean;
  onClose: () => void;
  onPick: (found: FoundRace) => void;
  onManual: () => void;
}) {
  const [query, setQuery] = useState('');
  const [near, setNear] = useState('');
  const [directory, setDirectory] = useState<DirectoryRace[]>([]);
  const [web, setWeb] = useState<WebRace[] | null>(null);
  const [webStatus, setWebStatus] = useState<'idle' | 'searching' | 'done'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  // Typing searches the directory only (no AI, no cost).
  useEffect(() => {
    const q = query.trim();
    setWeb(null);
    setWebStatus('idle');
    setMessage(null);
    if (q.length < 3) {
      setDirectory([]);
      return;
    }
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      const res = await searchDirectory(q, todayLocal);
      if (ticket !== latest.current) return;
      setError(res.ok ? null : res.error);
      setDirectory(res.data?.races ?? []);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, todayLocal]);

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 3 || webStatus === 'searching') return;
    const ticket = ++latest.current;
    setError(null);
    const dir = await searchDirectory(q, todayLocal);
    if (ticket !== latest.current) return;
    const hits = dir.data?.races ?? [];
    setDirectory(hits);
    if (hits.length >= WEB_FALLBACK_BELOW) {
      setMessage('Not the one? Search the web below.');
      return;
    }
    await runWeb(ticket);
  };

  const runWeb = async (ticket = ++latest.current) => {
    setWebStatus('searching');
    setMessage(null);
    const res = await searchWeb(query.trim(), near.trim(), todayLocal);
    if (ticket !== latest.current) return;
    setWebStatus('done');
    if (!res.ok) {
      setError(res.error);
      setWeb([]);
      return;
    }
    setWeb(res.data?.candidates ?? []);
    setMessage(res.data?.message ?? null);
  };

  const results: FoundRace[] = [
    ...directory.map((race) => ({ kind: 'directory' as const, race })),
    ...(web ?? []).map((race) => ({ kind: 'web' as const, race })),
  ];

  return (
    <Modal opened onClose={onClose} title="Find a race" radius={0} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
      >
        <Stack gap="xs">
          <TextInput
            radius={0}
            label="Race name"
            placeholder="Unbound Gravel, Boulder Roubaix…"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            data-autofocus
          />
          <TextInput
            radius={0}
            label="Near (optional)"
            placeholder="Town or region"
            value={near}
            onChange={(e) => setNear(e.currentTarget.value)}
          />
          <Group gap="xs">
            <Button type="submit" radius={0} loading={webStatus === 'searching'} disabled={query.trim().length < 3}>
              Search
            </Button>
            {webStatus !== 'searching' && directory.length >= WEB_FALLBACK_BELOW && web === null && (
              <Button radius={0} variant="subtle" onClick={() => void runWeb()}>
                Search the web
              </Button>
            )}
          </Group>
        </Stack>
      </form>

      <Box mt="md">
        {webStatus === 'searching' && (
          <Group gap="xs" py="xs">
            <Loader size="xs" />
            <Text size="sm" c="var(--color-text-secondary)">
              Searching race sites… this takes about 20 seconds.
            </Text>
          </Group>
        )}
        {results.length > 0 && (
          <Box style={{ borderTop: '1px solid var(--color-ink)' }}>
            {results.map((f, i) => (
              <ResultRow key={`${f.kind}-${i}`} found={f} isImperial={isImperial} onPick={onPick} />
            ))}
          </Box>
        )}
        {message && (
          <Text size="sm" mt="sm" c="var(--color-text-secondary)">
            {message}
          </Text>
        )}
        {error && (
          <Text size="sm" mt="sm" c="var(--color-signal-text)" role="alert">
            {error}
          </Text>
        )}
        {results.length > 0 && (
          <Text size="xs" mt="sm" c="var(--color-text-muted)">
            Check the details in the next step: nothing is saved until you save the race.
          </Text>
        )}
      </Box>

      <Group justify="flex-end" mt="md">
        <Button radius={0} variant="subtle" onClick={onManual}>
          Enter it myself
        </Button>
      </Group>
    </Modal>
  );
}
