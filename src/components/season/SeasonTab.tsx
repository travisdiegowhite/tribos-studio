/**
 * Season tab (/train?tab=season). Also hosts the former Race tab as its
 * "Race details" view (training cleanup, 2026-10).
 *
 * Season view: the year drawn as a ride (SeasonProfile — ridden
 * weeks inked in, the plan as a dashed ridge over phase-coloured terrain, races
 * as flags), with a race list showing each race's verdict and the engine's sentence.
 * Every date, phase and verdict comes from src/lib/season/engine.ts; this file
 * only draws them and offers the edits (move a week, priority, the race that
 * matters most in a block, remove, add / full edit through RaceGoalModal).
 * Saving lives in useSeasonPlan. The coach (SeasonCoachPanel) is asked only
 * on request — see docs/season-planner-build-plan.md.
 */

import { useMemo, useState, type CSSProperties } from 'react';
import { Box, Button, Group, Loader, SegmentedControl, Stack, Text, UnstyledButton } from '@mantine/core';
import RaceTab from '../training/RaceTab';
import { useMediaQuery } from '@mantine/hooks';
import { useSeasonPlan, type HoursSource, type SaveStatus, type SeasonActions, type SeasonPlanState } from '../../hooks/useSeasonPlan';
import { dayNumber, formatSeasonDate, type Priority, type SeasonPlan, type SeasonRaceResult, type Verdict } from '../../lib/season/engine';
import { PHASE_LABEL, PRIORITY_ROLE, seasonEndDate, todayWeekIndex, type RaceGoalRow } from '../../lib/season/view';
import RaceGoalModal from '../RaceGoalModal';
import { confirmFoundRace, toPrefill, type FoundRaceSource, type RacePrefill } from '../../lib/season/raceSearch';
import RaceSearchModal from './RaceSearchModal';
import SeasonCoachPanel from './SeasonCoachPanel';
import SeasonProfile, { SeasonProfileLegend } from './SeasonProfile';

// ─── Visual language (docs/season-planner-build-plan.md, "Year view UI") ────

const VERDICT_LABEL: Record<Verdict, string> = { on_track: 'On track', tight: 'Tight', conflict: 'Conflict' };

const BAND_LABEL = { short: 'Short', medium: 'Medium', long: 'Long', ultra: 'Ultra' } as const;
const SPORT_LABEL = { bike: 'Bike', run: 'Run', multi: 'Multisport' } as const;

const HOURS_SOURCE_TEXT: Record<HoursSource, string> = {
  history: 'your last 8 weeks',
  athlete: 'the hours you entered',
  default: 'a starting estimate — sync rides to personalise it',
};

const display: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.01em',
  lineHeight: 1,
};
const mono: CSSProperties = { fontFamily: 'var(--font-mono)' };

// ─── Pieces ─────────────────────────────────────────────────────────────────

function VerdictChip({ verdict }: { verdict: Verdict }) {
  if (verdict === 'on_track') {
    return (
      <Box
        component="span"
        style={{ ...mono, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-done)', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
      >
        <svg width="22" height="18" viewBox="0 0 26 22" aria-hidden>
          <path d="M2 12 C5 14 7 16 9.5 19.5 C13 12 18 6 24 2" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {VERDICT_LABEL[verdict]}
      </Box>
    );
  }
  const style: CSSProperties =
    verdict === 'conflict'
      ? { background: 'var(--color-signal)', color: 'var(--tribos-on-signal)', border: '1px solid var(--color-signal)' }
      : { background: 'transparent', color: 'var(--color-ink)', border: '1px solid var(--color-ink)' };
  return (
    <Box
      component="span"
      style={{ ...style, display: 'inline-flex', alignItems: 'center', padding: '2px 8px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
    >
      {VERDICT_LABEL[verdict]}
    </Box>
  );
}

function PriorityBadge({ priority, size = 22 }: { priority: string; size?: number }) {
  const filled = priority === 'A';
  return (
    <Box
      component="span"
      style={{
        ...display,
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.6,
        background: filled ? 'var(--color-ink)' : 'var(--color-bg)',
        color: filled ? 'var(--tribos-on-ink)' : 'var(--color-ink)',
        border: `${priority === 'C' ? 1 : 2}px solid var(--color-ink)`,
        flexShrink: 0,
      }}
    >
      {priority}
    </Box>
  );
}

function RaceRow({
  race,
  selected,
  onSelect,
}: {
  race: SeasonRaceResult;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <UnstyledButton
      onClick={onSelect}
      style={{
        display: 'block',
        width: '100%',
        padding: '12px 12px 12px 10px',
        borderBottom: '1px solid var(--color-border)',
        borderLeft: `3px solid ${selected ? 'var(--color-accent)' : 'transparent'}`,
        background: selected ? 'var(--color-ink-subtle)' : 'transparent',
      }}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
        <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
          <PriorityBadge priority={race.priority} />
          <Box style={{ minWidth: 0 }}>
            <Text fw={700} size="sm" truncate>
              {race.name}
            </Text>
            <Text size="xs" c="var(--color-text-secondary)" style={mono}>
              {formatSeasonDate(race.date)} · {PRIORITY_ROLE[race.priority]} · {SPORT_LABEL[race.sport]} · {BAND_LABEL[race.profile.band]}
            </Text>
          </Box>
        </Group>
        <VerdictChip verdict={race.verdict} />
      </Group>
      <Text size="sm" mt={6} style={{ paddingLeft: 34 }}>
        {race.reason}
      </Text>
    </UnstyledButton>
  );
}

const SAVE_STATUS_TEXT: Record<SaveStatus, string> = {
  idle: '',
  pending: 'Unsaved changes…',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Not saved',
};

const PRIORITY_OPTIONS = (['A', 'B', 'C'] as Priority[]).map((p) => ({ value: p, label: PRIORITY_ROLE[p] }));

interface PanelEditing {
  actions: SeasonActions;
  saveStatus: SaveStatus;
  onEditDetails: () => void;
}

function RaceEditor({ race, editing }: { race: SeasonRaceResult; editing: PanelEditing }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { actions, saveStatus } = editing;
  // A goal race in a back-to-back block that isn't (confirmed as) the one that matters most.
  const canFocus =
    race.priority === 'A' && race.blockFocusId !== null && (race.blockFocusId !== race.id || race.focusConfirmed === false);
  const small = { radius: 0, size: 'xs', variant: 'outline' } as const;

  return (
    <Stack gap="sm" mt="md" pt="md" style={{ borderTop: '1px solid var(--color-border)' }}>
      <Group gap="xs" wrap="wrap">
        <Button {...small} onClick={() => actions.move(race.id, -1)} aria-label={`Move ${race.name} one week earlier`}>
          ← Week earlier
        </Button>
        <Button {...small} onClick={() => actions.move(race.id, 1)} aria-label={`Move ${race.name} one week later`}>
          Week later →
        </Button>
      </Group>
      <SegmentedControl
        size="xs"
        radius={0}
        value={race.priority}
        onChange={(v) => actions.setPriority(race.id, v as Priority)}
        data={PRIORITY_OPTIONS}
        aria-label="Race priority"
      />
      {canFocus && (
        <Button {...small} variant="filled" onClick={() => actions.setFocus(race.id)}>
          This one matters more
        </Button>
      )}
      <Group gap="xs" justify="space-between" wrap="wrap">
        <Group gap="xs">
          <Button {...small} variant="subtle" onClick={editing.onEditDetails}>
            Edit details
          </Button>
          {confirmRemove ? (
            <>
              <Button
                {...small}
                variant="filled"
                loading={removing}
                onClick={async () => {
                  setRemoving(true);
                  const ok = await actions.remove(race.id);
                  setRemoving(false);
                  if (!ok) setConfirmRemove(false);
                }}
              >
                Remove {race.name}
              </Button>
              <Button {...small} variant="subtle" onClick={() => setConfirmRemove(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button {...small} variant="subtle" onClick={() => setConfirmRemove(true)}>
              Remove
            </Button>
          )}
        </Group>
        <Text size="xs" c={saveStatus === 'error' ? 'var(--color-signal-text)' : 'var(--color-text-muted)'} style={mono} aria-live="polite">
          {SAVE_STATUS_TEXT[saveStatus]}
        </Text>
      </Group>
    </Stack>
  );
}

function RacePanel({
  race,
  plan,
  todayLocal,
  editing,
  onOpenDetails,
}: {
  race: SeasonRaceResult | null;
  plan: SeasonPlan;
  todayLocal: string;
  editing: PanelEditing | null;
  onOpenDetails?: () => void;
}) {
  if (!race) return null;
  const related = race.relatedRaceId ? plan.races.find((r) => r.id === race.relatedRaceId) : null;
  const p = race.profile;
  const past = race.date < todayLocal;
  return (
    <Box style={{ border: '1px solid var(--color-border)', padding: 16 }}>
      <Text size="xs" c="var(--color-text-muted)" style={{ ...mono, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {PRIORITY_ROLE[race.priority]} race{race.week !== null ? ` · ${PHASE_LABEL[plan.schedule[race.week].phase]} week` : ''}
      </Text>
      <Group gap="sm" mt={8} wrap="nowrap">
        <PriorityBadge priority={race.priority} />
        <Text style={{ ...display, fontSize: 22 }}>{race.name}</Text>
      </Group>
      <Text size="sm" mt={4} style={mono}>
        {formatSeasonDate(race.date)}
      </Text>

      <Box mt="md">
        <VerdictChip verdict={race.verdict} />
        <Text mt={8} style={{ ...mono, fontSize: 15 }}>
          {race.reason}
        </Text>
      </Box>

      <Stack gap={4} mt="md">
        <Text size="xs" c="var(--color-text-secondary)" style={mono}>
          {BAND_LABEL[p.band]} race · taper {p.taperWeeks} wk · recover {p.recoverWeeks} wk
          {race.buildWeeks !== null ? ` · build ${race.buildWeeks} wk` : ''}
        </Text>
        {related && (
          <Text size="xs" c="var(--color-text-secondary)">
            Linked to {related.name} ({formatSeasonDate(related.date)}).
          </Text>
        )}
        {race.focusConfirmed === false && (
          <Text size="xs" c="var(--color-text-secondary)">
            These back-to-back goal races share one build, aimed at the last one until you pick the race that matters more.
          </Text>
        )}
      </Stack>

      {editing && !past && <RaceEditor key={race.id} race={race} editing={editing} />}
      {onOpenDetails && !past && (
        <Button mt="md" radius={0} size="xs" variant="subtle" onClick={onOpenDetails} style={{ paddingInline: 0 }}>
          Race details: route, profile, race coach →
        </Button>
      )}
      {past && (
        <Text size="xs" c="var(--color-text-muted)" mt="md">
          This race is in the past.
        </Text>
      )}
    </Box>
  );
}

// ─── Tab ────────────────────────────────────────────────────────────────────

/** Season | Race details: the race view shows one race's route, profile and race coach (the former Race tab). */
export interface RaceDetailsProps {
  view: 'season' | 'race';
  onViewChange: (view: 'season' | 'race') => void;
  trainingContext?: string | null;
  formatDist?: (km: number) => string;
  formatElev?: (m: number) => string;
}

export default function SeasonTab({
  isImperial = false,
  ...raceDetails
}: { isImperial?: boolean } & Partial<RaceDetailsProps>) {
  const details = raceDetails.view && raceDetails.onViewChange ? (raceDetails as RaceDetailsProps) : null;
  return <SeasonView {...useSeasonPlan()} isImperial={isImperial} raceDetails={details} />;
}

function ViewToggle({ details }: { details: RaceDetailsProps }) {
  return (
    <SegmentedControl
      radius={0}
      size="xs"
      value={details.view}
      onChange={(v) => details.onViewChange(v === 'race' ? 'race' : 'season')}
      data={[
        { value: 'season', label: 'Season' },
        { value: 'race', label: 'Race details' },
      ]}
      style={{ alignSelf: 'flex-start' }}
    />
  );
}

/** The tab's presentation, separate from data loading so it can be rendered from fixtures. */
export function SeasonView({
  loading,
  error,
  plan,
  savedPlan,
  hoursSource,
  ridden,
  todayLocal,
  rows,
  actions,
  saveStatus = 'idle',
  discussed = null,
  coach,
  isImperial = false,
  raceDetails = null,
}: SeasonPlanState & { isImperial?: boolean; raceDetails?: RaceDetailsProps | null }) {
  const isNarrow = useMediaQuery('(max-width: 900px)');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Add race starts with a search; the race form opens for a blank race ('new'),
  // a race found by search (prefilled, no id yet) or the race being edited.
  const [searching, setSearching] = useState(false);
  const [form, setForm] = useState<'new' | RacePrefill | RaceGoalRow | null>(null);
  const [foundSource, setFoundSource] = useState<FoundRaceSource | null>(null);

  const selected = useMemo(() => {
    if (!plan) return null;
    const byId = selectedId ? plan.races.find((r) => r.id === selectedId) : null;
    if (byId) return byId;
    // Default: the next A race from today, else the next race, else the first.
    const upcoming = plan.races.filter((r) => r.date >= todayLocal);
    return upcoming.find((r) => r.priority === 'A') ?? upcoming[0] ?? plan.races[0] ?? null;
  }, [plan, selectedId, todayLocal]);

  if (raceDetails?.view === 'race') {
    return (
      <Stack gap="md" py="md">
        <ViewToggle details={raceDetails} />
        <RaceTab
          initialRaceId={selected?.id ?? null}
          trainingContext={raceDetails.trainingContext ?? null}
          isImperial={isImperial}
          formatDist={raceDetails.formatDist}
          formatElev={raceDetails.formatElev}
        />
      </Stack>
    );
  }

  if (loading) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    );
  }
  if (error || !plan) {
    return (
      <Box py="lg">
        <Text fw={700}>Couldn&apos;t load your season.</Text>
        <Text size="sm" c="var(--color-text-secondary)">
          {error ?? 'Try again in a moment.'}
        </Text>
      </Box>
    );
  }

  const conflicts = plan.races.filter((r) => r.verdict === 'conflict').length;
  const todayWeek = todayWeekIndex(plan, todayLocal);
  const todayPos = (dayNumber(todayLocal) - dayNumber(plan.startDate)) / 7;
  const editing: PanelEditing | null =
    actions && selected
      ? {
          actions,
          saveStatus,
          onEditDetails: () => {
            const row = rows?.find((r) => r.id === selected.id) ?? null;
            void actions.flush().then(() => setForm(row));
          },
        }
      : null;
  const panel = (
    <Stack gap={16}>
      <RacePanel
        race={selected}
        plan={plan}
        todayLocal={todayLocal}
        editing={editing}
        onOpenDetails={raceDetails ? () => raceDetails.onViewChange('race') : undefined}
      />
      {actions && coach && (
        <SeasonCoachPanel plan={plan} discussed={discussed} coach={coach} actions={actions} />
      )}
    </Stack>
  );

  return (
    <Stack gap="lg" py="md">
      {raceDetails && <ViewToggle details={raceDetails} />}
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <Box>
          <Text style={{ ...display, fontSize: 32 }}>{savedPlan?.name ?? 'Season'}</Text>
          <Text size="sm" c="var(--color-text-secondary)" style={mono} mt={6}>
            {formatSeasonDate(plan.startDate)} – {formatSeasonDate(seasonEndDate(plan.startDate, plan.weeks))}
          </Text>
          <Text size="sm" c="var(--color-text-secondary)" mt={2}>
            Planned around <span style={mono}>{plan.typicalWeeklyHours}h</span> a week, from {HOURS_SOURCE_TEXT[hoursSource]}.
          </Text>
        </Box>
        <Group gap="md" align="center">
          {conflicts > 0 && (
            <span className="tribos-stamp" style={{ fontSize: 16 }}>
              {conflicts} conflict{conflicts === 1 ? '' : 's'}
            </span>
          )}
          {actions && (
            <Button radius={0} size="sm" onClick={() => void actions.flush().then(() => setSearching(true))}>
              Add race
            </Button>
          )}
        </Group>
      </Group>

      <Stack gap="sm">
        <Box style={{ borderTop: '1.5px solid var(--color-ink)', borderBottom: '1.5px solid var(--color-ink)', paddingBlock: 8 }}>
          <SeasonProfile
            plan={plan}
            ridden={ridden}
            todayWeek={todayWeek}
            todayPos={todayPos}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />
        </Box>
        <SeasonProfileLegend />
      </Stack>

      {plan.races.length === 0 ? (
        <Box style={{ border: '1px solid var(--color-border)', padding: 20 }}>
          <Text fw={700}>No races in this season yet.</Text>
          <Text size="sm" c="var(--color-text-secondary)" mt={4}>
            Add your races as goal (A), target (B) or tune-up (C) and the season fills in around them.
          </Text>
          {actions && (
            <Button mt="md" radius={0} onClick={() => void actions.flush().then(() => setSearching(true))}>
              Add race
            </Button>
          )}
        </Box>
      ) : (
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: isNarrow ? '1fr' : 'minmax(0, 3fr) minmax(280px, 2fr)',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* On a phone the selected race stacks directly under the profile, above the list. */}
          {isNarrow && panel}
          <Box style={{ borderTop: '1px solid var(--color-ink)' }}>
            {plan.races.map((r) => (
              <RaceRow key={r.id} race={r} selected={r.id === selected?.id} onSelect={() => setSelectedId(r.id)} />
            ))}
          </Box>
          {!isNarrow && panel}
        </Box>
      )}

      {/* The existing race form, for new races and full edits. Mounted only while open. */}
      {searching && (
        <RaceSearchModal
          todayLocal={todayLocal}
          isImperial={isImperial}
          onClose={() => setSearching(false)}
          onManual={() => {
            setSearching(false);
            setFoundSource(null);
            setForm('new');
          }}
          onPick={(found) => {
            const { prefill, source } = toPrefill(found);
            setSearching(false);
            setFoundSource(source);
            setForm(prefill);
          }}
        />
      )}
      {form !== null && (
        <RaceGoalModal
          opened
          onClose={() => {
            setForm(null);
            setFoundSource(null);
          }}
          raceGoal={form === 'new' ? null : form}
          isImperial={isImperial}
          onSaved={(saved?: { id?: string }) => {
            // A race found by search: share the athlete's saved version with the race list.
            if (foundSource && saved?.id) void confirmFoundRace(saved.id, foundSource);
            setForm(null);
            setFoundSource(null);
            actions?.reload();
          }}
        />
      )}
    </Stack>
  );
}
