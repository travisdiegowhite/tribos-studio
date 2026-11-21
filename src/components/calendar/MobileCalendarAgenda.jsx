/**
 * MobileCalendarAgenda — the training calendar on a phone.
 *
 * The desktop calendar is a 7-column grid. On a phone each column is ~50px
 * wide, so titles were cut to one letter ("E", "F", "Rur"), numbers wrapped
 * ("25/4 RSS"), and a day was a narrow scroll of icons. This draws the same
 * four weeks as a vertical agenda — one row per day, sessions as full-width
 * cards — which is how TrainingPeaks and Runna lay out a week on a phone.
 *
 * Everything a day shows comes from the calendar's own helpers and the shared
 * session model (resolveSession), so the agenda and the grid cannot disagree.
 *
 * Gestures:
 *   - tap a session → its detail (the grid lifts it instead; on a phone the
 *     detail is what people reach for);
 *   - the move button on a card lifts it, then tapping a day places it (the
 *     calendar's existing held-entry flow and banner);
 *   - tap an empty day → add a workout; with a library workout picked, tap a
 *     day to place it there.
 */

import { Box, Group, Stack, Text, ActionIcon } from '@mantine/core';
import { ArrowsDownUp, Barbell, Bicycle, Check, Circle, PersonSimpleRun, Plus, SkipForward, Pulse } from '@phosphor-icons/react';
import { resolveSession, COMPLIANCE_STYLE, formatMinutes } from '../../lib/training/session';
import { SessionProfile } from '../training/session';
import { sessionTone, sessionToneStyle, sessionRuleBorder } from '../../utils/calendarSessionTone';
import { isSkippedSession } from '../../../api/utils/sessionSkipped.js';
import { getActivitySport } from '../../utils/sportType';
import { formatLocalDate } from '../../utils/dateUtils';
import { WORKOUT_TYPES } from '../../utils/trainingPlans';
import HandTick from '../ui/HandTick';

const DAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const mono = { fontFamily: 'var(--font-mono)' };
const display = { fontFamily: 'var(--font-display)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.02em' };

function SportIcon({ sport, size = 16 }) {
  if (sport === 'running') return <PersonSimpleRun size={size} />;
  if (sport === 'other') return <Barbell size={size} />;
  if (sport === 'cycling') return <Bicycle size={size} />;
  return <Pulse size={size} />;
}

function SessionCard({ workout, today, thresholdPaceSec, isPast, isToday, held, onOpen, onToggleDone, onLift }) {
  const session = resolveSession(workout, { today, thresholdPaceSec });
  const skipped = !workout.completed && isSkippedSession(workout);
  const missed = isPast && !isToday && !workout.completed && !skipped;
  const tone = sessionTone(workout.workout_type, session.sport, skipped);
  const toneStyle = sessionToneStyle(tone);
  const support = tone === 'support' || tone === 'skipped';
  // The type table's names are written for rides ("Endurance Ride"); a run or
  // gym session gets its plain type instead.
  const plainType = String(workout.workout_type || '').replace(/_/g, ' ');
  const rawType = session.sport === 'cycling'
    ? WORKOUT_TYPES[workout.workout_type]?.name || plainType
    : plainType ? plainType[0].toUpperCase() + plainType.slice(1) : '';
  // Say the type only when it adds something ("Sweet Spot Intervals" twice is noise).
  const typeName = rawType && rawType.toLowerCase() !== String(workout.name || '').toLowerCase() ? rawType : '';
  const done = !!workout.completed;
  const showActual = !!session.actual && (session.actual.durationMin != null || session.actual.load != null);
  const minutes = showActual ? session.actual.durationMin : session.planned.durationMin;
  const load = showActual ? session.actual.load : session.planned.load;
  const settled = session.compliance.band !== 'upcoming' && session.compliance.band !== 'skipped';

  return (
    <Box
      data-testid="agenda-session"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      style={{
        cursor: 'pointer',
        background: support ? 'transparent' : 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderLeft: sessionRuleBorder(tone, session.sport),
        outline: held ? '2px solid var(--color-signal)' : undefined,
        padding: support ? '8px 10px' : '10px 12px',
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
        <Group gap={8} wrap="nowrap" style={{ minWidth: 0, flex: 1, color: 'var(--color-text-secondary)' }}>
          <SportIcon sport={session.sport} />
          <Box style={{ minWidth: 0 }}>
            <Text
              fw={support ? 500 : 700}
              size="sm"
              truncate="end"
              style={{
                color: done || missed || support ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                textDecoration: missed ? 'line-through' : undefined,
              }}
            >
              {session.title}
            </Text>
            {!support && (typeName || session.timing) && (
              <Text size="xs" c="dimmed" truncate="end">
                {[typeName, session.timing].filter(Boolean).join(' · ')}
              </Text>
            )}
          </Box>
        </Group>
        <Group gap={2} wrap="nowrap">
          {!done && !isPast && (
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              aria-label="Move this session"
              onClick={(e) => {
                e.stopPropagation();
                onLift();
              }}
            >
              <ArrowsDownUp size={16} />
            </ActionIcon>
          )}
          <ActionIcon
            variant="subtle"
            color={done ? 'green' : 'gray'}
            size="md"
            aria-label={done ? 'Mark not done' : 'Mark done'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone();
            }}
          >
            {done ? <Check size={18} /> : <Circle size={18} />}
          </ActionIcon>
        </Group>
      </Group>

      {!support && session.steps.length > 0 && (
        <Box mt={8} style={{ opacity: missed || skipped ? 0.45 : 1 }}>
          <SessionProfile steps={session.steps} sport={session.sport} height={22} compact />
        </Box>
      )}

      <Group gap="md" mt={support ? 2 : 8} wrap="nowrap">
        {done && (
          <Group gap={4} wrap="nowrap">
            <HandTick size={14} />
            <Text size="xs" fw={600} style={{ color: 'var(--color-done)' }}>Done</Text>
          </Group>
        )}
        {skipped && (
          <Group gap={4} wrap="nowrap" style={{ color: 'var(--color-text-secondary)', minWidth: 0 }}>
            <SkipForward size={12} />
            <Text size="xs" truncate="end">{workout.skipped_reason ? `Skipped · ${workout.skipped_reason}` : 'Skipped'}</Text>
          </Group>
        )}
        {minutes != null && (
          <Text size="xs" style={{ ...mono, color: 'var(--color-text-secondary)' }}>{formatMinutes(minutes)}</Text>
        )}
        {load != null && !support && (
          <Text size="xs" fw={700} style={{ ...mono, color: toneStyle.rssColor }}>
            {Math.round(load)}
            {showActual && session.planned.load != null ? `/${Math.round(session.planned.load)}` : ''} RSS
          </Text>
        )}
      </Group>

      {settled && (
        <Box
          data-testid="compliance-strip"
          data-band={session.compliance.band}
          title={COMPLIANCE_STYLE[session.compliance.band].label}
          style={{ height: 3, marginTop: 8, background: COMPLIANCE_STYLE[session.compliance.band].strip }}
        />
      )}
    </Box>
  );
}

/**
 * @param {object} props
 * @param {Date[]} props.days                    The visible days (four weeks from the anchor).
 * @param {(d: Date) => object[]} props.getWorkoutsForDate
 * @param {(d: Date) => object[]} props.getRidesForDate
 * @param {(d: Date) => object|null} props.getRaceGoalForDate
 * @param {Record<string, object>} [props.weatherForecast]
 * @param {(icon: string, size?: number) => any} props.getWeatherIcon
 * @param {(km: number) => string} props.formatDistance
 * @param {(t: number, imperial: boolean) => string} props.formatTemperature
 * @param {boolean} props.isImperial
 * @param {string} props.todayKey
 * @param {number|null} props.thresholdPaceSec
 * @param {string|null} props.heldEntryId
 * @param {boolean} props.placing               A session is held or a library workout is picked.
 * @param {(workout: object, date: Date) => void} props.onOpenSession
 * @param {(date: Date) => void} props.onDayTap  Place / assign / add, per the calendar's rules.
 * @param {(workout: object) => void} props.onToggleDone
 * @param {(id: string) => void} props.onLift
 * @param {(race: object, date: Date) => void} props.onOpenRace
 */
export default function MobileCalendarAgenda({
  days,
  getWorkoutsForDate,
  getRidesForDate,
  getRaceGoalForDate,
  weatherForecast,
  getWeatherIcon,
  formatDistance,
  formatTemperature,
  isImperial,
  todayKey,
  thresholdPaceSec,
  heldEntryId,
  placing,
  onOpenSession,
  onDayTap,
  onToggleDone,
  onLift,
  onOpenRace,
}) {
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <Stack gap="lg" data-testid="mobile-calendar-agenda">
      {weeks.map((week) => {
        const first = week[0];
        const last = week[week.length - 1];
        return (
          <Box key={formatLocalDate(first)}>
            <Text style={{ ...display, fontSize: 15, color: 'var(--color-text-primary)', borderBottom: '2px solid var(--color-ink)', paddingBottom: 4 }}>
              {MONTH[first.getMonth()]} {first.getDate()} – {first.getMonth() !== last.getMonth() ? `${MONTH[last.getMonth()]} ` : ''}{last.getDate()}
            </Text>
            <Stack gap={0}>
              {week.map((date) => {
                const key = formatLocalDate(date);
                const isToday = key === todayKey;
                const isPast = key < todayKey;
                const entries = getWorkoutsForDate(date);
                const sessions = entries.filter((w) => w.workout_type !== 'rest');
                const isRest = sessions.length === 0 && entries.some((w) => w.workout_type === 'rest');
                const race = getRaceGoalForDate(date);
                // Activities not linked to a session on this day show as their own line.
                const linked = new Set(entries.map((w) => w.activity_id).filter(Boolean));
                const unplanned = getRidesForDate(date).filter((r) => !linked.has(r.id));
                const weather = !isPast ? weatherForecast?.[key] : null;
                const empty = sessions.length === 0 && !race && unplanned.length === 0;

                return (
                  <Box
                    key={key}
                    data-testid="agenda-day"
                    role="button"
                    tabIndex={0}
                    aria-label={`${DAY[date.getDay()]} ${date.getDate()}`}
                    onClick={() => onDayTap(date)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onDayTap(date);
                      }
                    }}
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      gap: 12,
                      padding: '12px 0',
                      borderBottom: '1px solid var(--color-border)',
                      background: placing ? 'var(--color-ink-subtle)' : undefined,
                      width: '100%',
                      alignItems: 'flex-start',
                    }}
                  >
                    {/* Date column */}
                    <Box
                      style={{
                        width: 48,
                        flexShrink: 0,
                        textAlign: 'center',
                        padding: '4px 0',
                        background: isToday ? 'var(--color-ink)' : undefined,
                        color: isToday ? 'var(--color-bg)' : isPast ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                      }}
                    >
                      <Text style={{ ...display, fontSize: 11, color: 'inherit', lineHeight: 1 }}>{DAY[date.getDay()]}</Text>
                      <Text style={{ ...display, fontSize: 24, color: 'inherit', lineHeight: 1.1 }}>{date.getDate()}</Text>
                      {weather && (
                        <Group gap={2} justify="center" mt={4} wrap="nowrap" style={{ color: isToday ? 'inherit' : 'var(--color-text-muted)' }}>
                          {getWeatherIcon(weather.icon, 12)}
                          <Text style={{ ...mono, fontSize: 10, color: 'inherit' }}>
                            {formatTemperature(weather.temperatureHigh, isImperial).replace(/°[FC]/, '°')}
                          </Text>
                        </Group>
                      )}
                    </Box>

                    {/* The day */}
                    <Stack gap={8} style={{ flex: 1, minWidth: 0 }}>
                      {race && (
                        <Box
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenRace(race, date);
                          }}
                        >
                          <span className="tribos-stamp" style={{ fontSize: 15, padding: '2px 8px' }}>
                            Race day · {race.priority}
                          </span>
                          <Text size="sm" fw={700} mt={4} truncate="end">{race.name}</Text>
                        </Box>
                      )}
                      {sessions.map((w) => (
                        <SessionCard
                          key={w.id}
                          workout={w}
                          today={todayKey}
                          thresholdPaceSec={thresholdPaceSec}
                          isPast={isPast}
                          isToday={isToday}
                          held={heldEntryId === w.id}
                          onOpen={() => onOpenSession(w, date)}
                          onToggleDone={() => onToggleDone(w)}
                          onLift={() => onLift(w.id)}
                        />
                      ))}
                      {unplanned.map((r) => {
                        const sport = getActivitySport(r);
                        const km = (r.distance || 0) / 1000;
                        const load = r.rss ?? r.tss;
                        return (
                          <Group key={r.id} gap={8} wrap="nowrap" style={{ color: 'var(--color-text-secondary)', minWidth: 0 }}>
                            <SportIcon sport={sport} size={14} />
                            <Text size="sm" truncate="end" style={{ minWidth: 0, flex: 1 }}>{r.name || 'Activity'}</Text>
                            <Text size="xs" style={{ ...mono, whiteSpace: 'nowrap' }}>
                              {[km > 0 ? formatDistance(km) : null, load > 0 ? `${Math.round(load)} RSS` : null].filter(Boolean).join(' · ')}
                            </Text>
                          </Group>
                        );
                      })}
                      {isRest && !race && <Text size="sm" c="dimmed">Rest day</Text>}
                      {empty && !isRest && (
                        <Group gap={6} style={{ color: 'var(--color-text-muted)', minHeight: 28 }}>
                          {!isPast && <Plus size={14} />}
                          <Text size="sm" c="dimmed">{placing ? 'Tap to place here' : isPast ? 'Nothing logged' : 'Add a workout'}</Text>
                        </Group>
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
