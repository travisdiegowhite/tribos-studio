/**
 * Season tab (/train?tab=season, behind the season_planner flag).
 *
 * Read-only season view: the year drawn as a ride (SeasonProfile — ridden
 * weeks inked in, the plan as a dashed ridge over phase-coloured terrain, races
 * as flags), with a race list showing each race's verdict and the engine's sentence.
 * Every date, phase and verdict comes from src/lib/season/engine.ts; this file
 * only draws them. Editing (move, re-prioritize, pick a block's focus) and the
 * coach's commentary arrive in later phases — see docs/season-planner-build-plan.md.
 */

import { useMemo, useState, type CSSProperties } from 'react';
import { Box, Button, Group, Loader, Stack, Text, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useNavigate } from 'react-router-dom';
import { useSeasonPlan, type HoursSource, type SeasonPlanState } from '../../hooks/useSeasonPlan';
import { dayNumber, formatSeasonDate, type SeasonPlan, type SeasonRaceResult, type Verdict } from '../../lib/season/engine';
import { PHASE_LABEL, PRIORITY_ROLE, seasonEndDate, todayWeekIndex } from '../../lib/season/view';
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

function RacePanel({ race, plan }: { race: SeasonRaceResult | null; plan: SeasonPlan }) {
  if (!race) return null;
  const related = race.relatedRaceId ? plan.races.find((r) => r.id === race.relatedRaceId) : null;
  const p = race.profile;
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
            These back-to-back goal races share one build, aimed at the last one. Choosing which race matters more comes with editing.
          </Text>
        )}
      </Stack>

      <Box mt="md" pt="md" style={{ borderTop: '1px solid var(--color-border)' }}>
        <Text size="xs" c="var(--color-text-muted)">
          Coach commentary on changes arrives in a later update.
        </Text>
      </Box>
    </Box>
  );
}

// ─── Tab ────────────────────────────────────────────────────────────────────

export default function SeasonTab() {
  return <SeasonView {...useSeasonPlan()} />;
}

/** The tab's presentation, separate from data loading so it can be rendered from fixtures. */
export function SeasonView({ loading, error, plan, savedPlan, hoursSource, ridden, todayLocal }: SeasonPlanState) {
  const isNarrow = useMediaQuery('(max-width: 900px)');
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (!plan) return null;
    const byId = selectedId ? plan.races.find((r) => r.id === selectedId) : null;
    if (byId) return byId;
    // Default: the next A race from today, else the next race, else the first.
    const upcoming = plan.races.filter((r) => r.date >= todayLocal);
    return upcoming.find((r) => r.priority === 'A') ?? upcoming[0] ?? plan.races[0] ?? null;
  }, [plan, selectedId, todayLocal]);

  if (loading) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" color="dark" />
      </Group>
    );
  }
  if (error || !plan) {
    return (
      <Box py="lg">
        <Text fw={700}>Couldn't load your season.</Text>
        <Text size="sm" c="var(--color-text-secondary)">
          {error ?? 'Try again in a moment.'}
        </Text>
      </Box>
    );
  }

  const conflicts = plan.races.filter((r) => r.verdict === 'conflict').length;
  const todayWeek = todayWeekIndex(plan, todayLocal);
  const todayPos = (dayNumber(todayLocal) - dayNumber(plan.startDate)) / 7;

  return (
    <Stack gap="lg" py="md">
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
        {conflicts > 0 && (
          <span className="tribos-stamp" style={{ fontSize: 16 }}>
            {conflicts} conflict{conflicts === 1 ? '' : 's'}
          </span>
        )}
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
          <Button mt="md" color="dark" radius={0} onClick={() => navigate('/train?tab=race')}>
            Add races
          </Button>
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
          {isNarrow && <RacePanel race={selected} plan={plan} />}
          <Box style={{ borderTop: '1px solid var(--color-ink)' }}>
            {plan.races.map((r) => (
              <RaceRow key={r.id} race={r} selected={r.id === selected?.id} onSelect={() => setSelectedId(r.id)} />
            ))}
          </Box>
          {!isNarrow && <RacePanel race={selected} plan={plan} />}
        </Box>
      )}
    </Stack>
  );
}
