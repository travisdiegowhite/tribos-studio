/**
 * Season tab (/train?tab=season, behind the season_planner flag).
 *
 * Read-only year view: the phase band, race markers, weekly hours and a today
 * line, with a race list showing each race's verdict and the engine's sentence.
 * Every date, phase and verdict comes from src/lib/season/engine.ts; this file
 * only draws them. Editing (move, re-prioritize, pick a block's focus) and the
 * coach's commentary arrive in later phases — see docs/season-planner-build-plan.md.
 */

import { useMemo, useState, type CSSProperties } from 'react';
import { Box, Button, Group, Loader, Stack, Text, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useNavigate } from 'react-router-dom';
import { useSeasonPlan, type HoursSource, type SeasonPlanState } from '../../hooks/useSeasonPlan';
import { formatSeasonDate, type Phase, type SeasonPlan, type SeasonRaceResult, type Verdict } from '../../lib/season/engine';
import { monthMarks, seasonEndDate, todayWeekIndex } from '../../lib/season/view';

// ─── Visual language (docs/season-planner-build-plan.md, "Year view UI") ────

const PHASE_STYLE: Record<Phase, { label: string; fill: string; border?: string }> = {
  recover: { label: 'Recover', fill: 'var(--color-easy-subtle)', border: 'var(--color-easy-border)' },
  base: { label: 'Base', fill: 'var(--color-bg-secondary)', border: 'var(--color-border)' },
  build: { label: 'Build', fill: 'var(--color-signal)' },
  peak: { label: 'Peak', fill: 'var(--color-ink)' },
  taper: { label: 'Taper / race', fill: 'var(--color-highlight)' },
};
const PHASE_ORDER: Phase[] = ['recover', 'base', 'build', 'peak', 'taper'];

const VERDICT_LABEL: Record<Verdict, string> = { on_track: 'On track', tight: 'Tight', conflict: 'Conflict' };

const BAND_LABEL = { short: 'Short', medium: 'Medium', long: 'Long', ultra: 'Ultra' } as const;
const SPORT_LABEL = { bike: 'Bike', run: 'Run', multi: 'Multisport' } as const;

const HOURS_SOURCE_TEXT: Record<HoursSource, string> = {
  history: 'your last 8 weeks',
  athlete: 'the hours you entered',
  default: 'a starting estimate — sync rides to personalise it',
};

const CAL_MIN_WIDTH = 940;
const LABEL_COL = 56;

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
  const style: CSSProperties =
    verdict === 'on_track'
      ? { background: 'var(--color-done)', color: 'var(--tribos-on-done)', border: '1px solid var(--color-done)' }
      : verdict === 'conflict'
        ? { background: 'var(--color-signal)', color: 'var(--tribos-on-signal)', border: '1px solid var(--color-signal)' }
        : { background: 'transparent', color: 'var(--color-ink)', border: '1px solid var(--color-ink)' };
  return (
    <Box
      component="span"
      style={{
        ...style,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {verdict === 'on_track' && <span aria-hidden>✓</span>}
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

function Legend() {
  return (
    <Group gap="md" wrap="wrap">
      {PHASE_ORDER.map((p) => (
        <Group key={p} gap={6} wrap="nowrap">
          <Box
            style={{
              width: 14,
              height: 14,
              background: PHASE_STYLE[p].fill,
              border: `1px solid ${PHASE_STYLE[p].border ?? PHASE_STYLE[p].fill}`,
            }}
          />
          <Text size="xs" c="var(--color-text-secondary)">
            {PHASE_STYLE[p].label}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

function SeasonCalendar({
  plan,
  todayWeek,
  selectedId,
  onSelect,
}: {
  plan: SeasonPlan;
  todayWeek: number | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const marks = useMemo(() => monthMarks(plan), [plan]);
  const maxHours = Math.max(1, ...plan.schedule.map((w) => w.targetHours));
  const racesByWeek = useMemo(() => {
    const map = new Map<number, SeasonRaceResult[]>();
    for (const r of plan.races) {
      if (r.week === null) continue;
      map.set(r.week, [...(map.get(r.week) ?? []), r]);
    }
    return map;
  }, [plan]);

  const columns = `${LABEL_COL}px repeat(${plan.weeks}, minmax(0, 1fr))`;
  const rowLabel = (text: string) => (
    <Text size="10px" c="var(--color-text-muted)" style={{ ...mono, alignSelf: 'center' }}>
      {text}
    </Text>
  );
  // Centre of the today week, as a fraction of the week area.
  const todayLeft =
    todayWeek === null ? null : `calc(${LABEL_COL}px + (100% - ${LABEL_COL}px) * ${(todayWeek + 0.5) / plan.weeks})`;

  return (
    <Box style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <Box style={{ minWidth: CAL_MIN_WIDTH, position: 'relative', padding: '4px 0' }}>
        {/* Months */}
        <Box style={{ display: 'grid', gridTemplateColumns: columns, height: 18 }}>
          <span />
          {plan.schedule.map((w) => {
            const mark = marks.find((m) => m.week === w.index);
            return (
              <Text key={w.index} size="10px" fw={700} style={{ ...mono, whiteSpace: 'nowrap', overflow: 'visible' }}>
                {mark?.label ?? ''}
              </Text>
            );
          })}
        </Box>

        {/* Race markers */}
        <Box style={{ display: 'grid', gridTemplateColumns: columns, height: 30, alignItems: 'center' }}>
          {rowLabel('RACES')}
          {plan.schedule.map((w) => {
            const races = racesByWeek.get(w.index) ?? [];
            return (
              <Box key={w.index} style={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                {races.map((r) => (
                  <UnstyledButton
                    key={r.id}
                    onClick={() => onSelect(r.id)}
                    aria-label={`${r.name}, ${r.priority} race, ${VERDICT_LABEL[r.verdict]}`}
                    title={`${r.name} — ${formatSeasonDate(r.date)}`}
                    style={{
                      outline: r.id === selectedId ? '2px solid var(--color-accent)' : undefined,
                      outlineOffset: 1,
                    }}
                  >
                    <PriorityBadge priority={r.priority} size={r.priority === 'A' ? 16 : 13} />
                  </UnstyledButton>
                ))}
              </Box>
            );
          })}
        </Box>

        {/* Phase band */}
        <Box style={{ display: 'grid', gridTemplateColumns: columns, height: 22 }}>
          {rowLabel('PHASE')}
          {plan.schedule.map((w) => (
            <Box
              key={w.index}
              title={`${PHASE_STYLE[w.phase].label} · week of ${formatSeasonDate(w.startDate)}`}
              style={{
                background: PHASE_STYLE[w.phase].fill,
                borderTop: `1px solid ${PHASE_STYLE[w.phase].border ?? PHASE_STYLE[w.phase].fill}`,
                borderBottom: `1px solid ${PHASE_STYLE[w.phase].border ?? PHASE_STYLE[w.phase].fill}`,
                borderRight: '1px solid var(--color-bg)',
              }}
            />
          ))}
        </Box>

        {/* Weekly hours */}
        <Box style={{ display: 'grid', gridTemplateColumns: columns, height: 56, alignItems: 'end', marginTop: 6 }}>
          {rowLabel('HOURS')}
          {plan.schedule.map((w) => (
            <Box
              key={w.index}
              title={`${w.targetHours} h`}
              style={{
                height: `${(w.targetHours / maxHours) * 100}%`,
                background: 'var(--color-easy)',
                marginRight: 1,
              }}
            />
          ))}
        </Box>

        {/* Today line */}
        {todayLeft && (
          <Box
            aria-hidden
            style={{
              position: 'absolute',
              top: 18,
              bottom: 0,
              left: todayLeft,
              width: 2,
              background: 'var(--color-accent)',
              pointerEvents: 'none',
            }}
          />
        )}
      </Box>
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
              {formatSeasonDate(race.date)} · {SPORT_LABEL[race.sport]} · {BAND_LABEL[race.profile.band]}
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
      <Text size="xs" c="var(--color-text-muted)" style={{ ...mono, letterSpacing: '0.08em' }}>
        SELECTED RACE
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
            This block's build aims at its last race. Choosing which race matters more comes with editing.
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
export function SeasonView({ loading, error, plan, savedPlan, hoursSource, todayLocal }: SeasonPlanState) {
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

      <Box style={{ border: '1px solid var(--color-border)', padding: 12 }}>
        <SeasonCalendar plan={plan} todayWeek={todayWeek} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
        <Box mt="sm">
          <Legend />
        </Box>
      </Box>

      {plan.races.length === 0 ? (
        <Box style={{ border: '1px solid var(--color-border)', padding: 20 }}>
          <Text fw={700}>No races in this season yet.</Text>
          <Text size="sm" c="var(--color-text-secondary)" mt={4}>
            Add your races with A/B/C priorities and the season fills in around them.
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
          {/* On a phone the selected race stacks directly under the calendar, above the list. */}
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
