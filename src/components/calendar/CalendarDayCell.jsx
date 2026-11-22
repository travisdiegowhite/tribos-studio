/**
 * One day of the desktop calendar grid: its sessions (drawn from the shared
 * session core), races, rides, cross-training, weather and the day's load,
 * plus the gestures (tap to add, tap to lift and place, drag to move). Split
 * out of TrainingCalendar.jsx, which keeps the state and handlers and passes
 * them in; nothing here owns state.
 */
import { Card, Text, Group, Badge, Stack, ActionIcon, Tooltip, Box } from '@mantine/core';
import { WORKOUT_TYPES } from '../../utils/trainingPlans';
import { getActivitySport } from '../../utils/sportType';
import { estimateActivityTSS } from '../../utils/computeFitnessSnapshots';
import { getAnyWorkoutById as getWorkoutById } from '../../data/workoutLookup';
import { resolveSession, COMPLIANCE_STYLE } from '../../lib/training/session';
import { SessionProfile } from '../training/session';
import { sessionTone, sessionToneStyle, sessionRuleBorder } from '../../utils/calendarSessionTone';
import { isSkippedSession } from '../../../api/utils/sessionSkipped.js';
import { formatLocalDate } from '../../utils/dateUtils';
import { StravaLogo } from '../StravaBranding';
import { FuelBadge } from '../fueling';
import HandTick from '../ui/HandTick';
import { ACTIVITY_CATEGORIES } from '../../hooks/useCrossTraining';
import { Barbell, Bicycle, Check, Circle, Heartbeat, Path, PersonSimpleRun, SkipForward } from '@phosphor-icons/react';
import { getWeatherSeverity, formatTemperature } from '../../utils/weather';

export default function CalendarDayCell({
  date,
  index,
  dragOverDate,
  formatDistance,
  ftp,
  getCrossTrainingForDate,
  getCrossTrainingIcon,
  getRaceGoalForDate,
  getRidesForDate,
  getWeatherIcon,
  getWorkoutsForDate,
  handleAddFromLibrary,
  handleCreateRoute,
  handleDragEnd,
  handleDragLeave,
  handleDragOver,
  handleDragStart,
  handleDrop,
  heldEntryId,
  isImperial,
  openAddModal,
  openCrossTrainingModal,
  openEditModal,
  openRaceGoalModal,
  placeEntry,
  runThresholds,
  selectedWorkoutId,
  setHeldEntryId,
  setSelectedWorkoutId,
  todayKey,
  toggleWorkoutCompletion,
  weatherForecast,
}) {
  if (!date) {
    return <div key={`empty-${index}`} style={{ minHeight: 80 }} />;
  }

  const dayWorkouts = getWorkoutsForDate(date);
  // The day's sessions (rest entries aside), in the order to do them.
  const sessions = dayWorkouts.filter((w) => w.workout_type !== 'rest');
  const isRestDay = sessions.length === 0 && dayWorkouts.some((w) => w.workout_type === 'rest');
  // A skipped session is settled, like a done one: the day isn't dimmed as missed.
  const allDone = sessions.length > 0 && sessions.every((w) => w.completed || isSkippedSession(w));
  const dayRides = getRidesForDate(date);
  const raceGoal = getRaceGoalForDate(date);
  const isToday = date.toDateString() === new Date().toDateString();
  const isPast = date < new Date() && !isToday;

  // Weather for this day
  const dayWeather = weatherForecast?.[formatLocalDate(date)];
  const weatherSev = dayWeather && !isPast ? getWeatherSeverity(dayWeather, undefined, isImperial) : null;

  // Calculate day's TSS (including cycling and cross-training)
  let dayTSS = 0;
  dayRides.forEach(ride => {
    // The app's one estimator: sanitized stored RSS, then the
    // run model, EP/NP + FTP, kJ, heuristic (it used to use
    // average watts here, which reads interval days low).
    dayTSS += Math.min(estimateActivityTSS(ride, ftp) || 0, 500);
  });

  // Add cross-training TSS
  const dayCrossTraining = getCrossTrainingForDate(date);
  dayCrossTraining.forEach(activity => {
    dayTSS += activity.estimated_tss || 0;
  });

  // Day-cell state, per the blend calendar board: flat sheets
  // divided by rules. Today is outlined in ink; a race gets a
  // signal rule (and a stamp below); ridden sessions carry the
  // moss hand tick and missed ones are struck through, so state
  // never rests on a fill colour alone.
  let borderColor = isToday ? 'var(--color-ink)' : 'var(--color-border)';
  let borderWidth = isToday ? 2 : 1;
  const backgroundColor = isPast && !isToday ? 'var(--color-bg-secondary)' : 'var(--color-card)';

  if (raceGoal && raceGoal.priority !== 'C') {
    borderColor = 'var(--color-signal)';
    borderWidth = 2;
  }

  // Check if this date is a drop target (use formatLocalDate for consistent comparison)
  const isDropTarget = dragOverDate === formatLocalDate(date);

  return (
    <Card
      key={index}
      withBorder
      p="xs"
      onDragOver={(e) => handleDragOver(e, date)}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, date)}
      style={{
        minHeight: 110,
        backgroundColor: isDropTarget ? 'var(--color-ink-subtle)' : backgroundColor,
        border: isDropTarget ? '2px dashed var(--color-ink)' : `${borderWidth}px solid ${borderColor}`,
        opacity: isPast && !allDone && !dayRides.length ? 0.7 : 1,
        cursor: 'pointer',
        transition: 'background-color 0.2s, border 0.2s',
      }}
      onClick={() => {
        // Tap-to-assign from the library.
        if (selectedWorkoutId) {
          handleAddFromLibrary(selectedWorkoutId, date);
          setSelectedWorkoutId(null);
          return;
        }
        // TAP TO LIFT, TAP TO PLACE — the primary gesture, and
        // the only one that works on touch. HTML5 drag-and-drop
        // does not fire there, so on a phone or iPad dragging a
        // session has never once worked. Drag still works on
        // desktop for anyone who prefers it.
        if (heldEntryId) {
          // Tapping the held session's own day opens it instead
          // of placing it on itself.
          const held = dayWorkouts.find((w) => w.id === heldEntryId);
          if (held) {
            setHeldEntryId(null);
            openEditModal(held, date);
          } else {
            placeEntry(heldEntryId, date);
          }
          return;
        }
        // `if (!activePlan) return` used to sit here. It made a
        // tap do NOTHING — no modal, no error, no explanation —
        // whenever no plan was active, which is indistinguishable
        // from a broken app.
        //
        // A tap on a session lifts THAT session (its own handler
        // below); a tap on the rest of the cell lifts the first.
        if (dayWorkouts.length > 0) {
          setHeldEntryId((sessions[0] ?? dayWorkouts[0]).id);
        } else {
          openAddModal(date);
        }
      }}
    >
      <Stack gap={4}>
        {/* Date and completion checkbox */}
        <Group justify="space-between" align="center">
          <Text size="sm" fw={700} style={{ color: 'var(--color-text-primary)' }}>
            {date.getDate()}
            <Text span size="xs" fw={400} c="dimmed" ml={4}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()]}
            </Text>
          </Text>
        </Group>

        {/* Weather forecast strip */}
        {dayWeather && weatherSev && (
          <Tooltip label={`${dayWeather.description} · Humidity: ${dayWeather.humidity}% · ${weatherSev.message}`}>
            <Group gap={6} style={{
              borderRadius: 4,
              backgroundColor: `color-mix(in srgb, var(--mantine-color-${weatherSev.color}-6) 20%, transparent)`,
              padding: '3px 6px',
            }}>
              {getWeatherIcon(dayWeather.icon, 14)}
              <Text size="xs" fw={500} c="dimmed" style={{ lineHeight: 1.2 }}>
                {formatTemperature(dayWeather.temperatureHigh, isImperial).replace(/°[FC]/, '')}/{formatTemperature(dayWeather.temperatureLow, isImperial)}
              </Text>
            </Group>
          </Tooltip>
        )}

        {/* Sessions — every one on the day, in the order to do
            them. Each is its own tap and drag target, so either
            half of a two-a-day can be moved or ticked off. */}
        {sessions.map((workout) => {
          const isSkipped = !workout.completed && isSkippedSession(workout);
          const isMissed = isPast && !isToday && !workout.completed && !isSkipped;
          const sessionSport = workout.sport;
          const timing = typeof workout.details?.timing === 'string' ? workout.details.timing : null;
          const doneLabel = sessionSport === 'running' ? 'Run' : sessionSport === 'other' ? 'Done' : 'Ridden';
          // Colour = intensity, rule shape = sport; support work steps back.
          const tone = sessionTone(workout.workout_type, sessionSport, isSkipped);
          const toneStyle = sessionToneStyle(tone);
          const isSupport = tone === 'support' || tone === 'skipped';
          const typeName = WORKOUT_TYPES[workout.workout_type]?.name || String(workout.workout_type || 'workout').replace(/_/g, ' ');
          const sportName = sessionSport === 'running' ? 'Run' : sessionSport === 'other' ? null : 'Ride';
          // The same session model the detail view and Today draw.
          const session = resolveSession(workout, { today: todayKey, thresholdPaceSec: runThresholds.thresholdPaceSec });
          const settled = session.compliance.band !== 'upcoming';
          const showActual = !!session.actual && (session.actual.durationMin != null || session.actual.load != null);
          return (
            <Box
              key={workout.id}
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                handleDragStart(e, workout, date);
              }}
              onDragEnd={handleDragEnd}
              onClick={(e) => {
                // While placing or assigning, the tap belongs to the day.
                if (heldEntryId || selectedWorkoutId) return;
                e.stopPropagation();
                setHeldEntryId(workout.id);
              }}
              style={{
                cursor: 'grab',
                outline: heldEntryId === workout.id ? '2px solid var(--color-signal)' : undefined,
                borderLeft: sessionRuleBorder(tone, sessionSport),
                backgroundColor: toneStyle.wash,
                padding: isSupport || !toneStyle.wash ? '2px 0 2px 8px' : '6px 6px 6px 8px',
                marginTop: workout !== sessions[0] ? 6 : 0,
              }}
            >
            {/* Workout type with icon, and its completion tick */}
            <Group gap={4} mb={4} justify="space-between" wrap="nowrap">
              <Group gap={4} wrap="nowrap" style={{ minWidth: 0, color: 'var(--color-text-secondary)' }}>
                {sessionSport === 'running' ? <PersonSimpleRun size={12} style={{ flex: 'none' }} />
                  : sessionSport === 'other' ? <Barbell size={12} style={{ flex: 'none' }} />
                  : <Bicycle size={12} style={{ flex: 'none' }} />}
                <Text size="xs" fw={600} truncate="end" title={typeName} style={{ color: 'inherit', textTransform: 'capitalize' }}>
                  {sportName && !isSupport ? `${sportName} · ${typeName}` : typeName}
                </Text>
              </Group>
              <ActionIcon
                size="sm"
                variant="subtle"
                color={workout.completed ? 'green' : 'gray'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleWorkoutCompletion(workout);
                }}
              >
                {workout.completed ? <Check size={14} /> : <Circle size={14} />}
              </ActionIcon>
            </Group>
            {/* Workout name */}
            <Text
              size="xs"
              fw={isSupport ? 500 : 700}
              lineClamp={1}
              mb={2}
              style={{
                color: workout.completed || isMissed || isSupport ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                textDecoration: isMissed ? 'line-through' : undefined,
              }}
            >
              {session.title || WORKOUT_TYPES[workout.workout_type]?.name || 'Workout'}
            </Text>
            {session.steps.length > 0 && (
              <Box mb={4} style={{ opacity: isMissed || isSkipped ? 0.45 : 1 }}>
                <SessionProfile steps={session.steps} sport={session.sport} height={18} compact />
              </Box>
            )}
            {/* Order and gap on a two-session day, as the coach set it */}
            {timing && (
              <Tooltip label={timing} multiline w={200} withArrow>
                <Text size="xs" c="dimmed" lineClamp={1} mb={2}>
                  {timing}
                </Text>
              </Tooltip>
            )}
            {isSkipped && (
              <Tooltip label={workout.skipped_reason || 'Skipped by choice'} multiline w={220} withArrow>
                <Group gap={4} mb={2} wrap="nowrap" style={{ minWidth: 0, color: 'var(--color-text-secondary)' }}>
                  <SkipForward size={12} style={{ flex: 'none' }} />
                  <Text size="xs" fw={500} truncate="end" style={{ color: 'inherit' }}>
                    {workout.skipped_reason ? `Skipped · ${workout.skipped_reason}` : 'Skipped'}
                  </Text>
                </Group>
              </Tooltip>
            )}
            {workout.completed && (
              <Group gap={4} mb={2}>
                <HandTick size={14} />
                <Text size="xs" fw={500} style={{ color: 'var(--color-done)' }}>{doneLabel}</Text>
              </Group>
            )}
            {/* Duration and stress: what was done once it is done
                (planned beside it), what is planned until then. */}
            <Group gap={8}>
              {showActual ? (
                <>
                  {session.actual.durationMin != null && (
                    <Text size="xs" fw={500} style={{ color: 'var(--color-text-secondary)' }}>
                      {Math.round(session.actual.durationMin)} min
                    </Text>
                  )}
                  {session.actual.load != null && (
                    <Tooltip label={`Planned ${session.planned.load != null ? Math.round(session.planned.load) : '—'} · ${COMPLIANCE_STYLE[session.compliance.band].label}`} withArrow>
                      <Text size="xs" fw={600} style={{ color: toneStyle.rssColor }}>
                        {Math.round(session.actual.load)}{session.planned.load != null ? `/${Math.round(session.planned.load)}` : ''} RSS
                      </Text>
                    </Tooltip>
                  )}
                </>
              ) : (
                <>
                  {workout.target_duration > 0 && (
                    <Text size="xs" fw={500} style={{ color: 'var(--color-text-secondary)' }}>
                      {workout.target_duration} min
                    </Text>
                  )}
                  {workout.target_tss > 0 && (
                    <Text size="xs" fw={600} style={{ color: toneStyle.rssColor }}>
                      {workout.target_tss} RSS
                    </Text>
                  )}
                </>
              )}
              {/* Fuel indicator for longer workouts */}
              <FuelBadge
                durationMinutes={workout.target_duration}
                targetTSS={workout.target_tss}
                workoutCategory={workout.workout_type}
                size="xs"
                variant="text"
              />
            </Group>
            {/* Coach adjustment indicator */}
            {(workout.original_scheduled_date || workout.original_workout_id) && (
              <Tooltip
                label={
                  <Stack gap={2}>
                    <Text size="xs" fw={600}>Coach adjusted</Text>
                    {workout.original_scheduled_date && (
                      <Text size="xs">Originally: {workout.original_scheduled_date}</Text>
                    )}
                    {workout.original_workout_id && (
                      <Text size="xs">
                        Was: {getWorkoutById(workout.original_workout_id)?.name || workout.original_workout_id}
                      </Text>
                    )}
                  </Stack>
                }
                position="bottom"
                withArrow
              >
                <Text
                  className="tribos-hand"
                  span
                  style={{ fontSize: 17, cursor: 'help', display: 'inline-block' }}
                >
                  {workout.original_scheduled_date ? 'moved here' : 'swapped'}
                </Text>
              </Tooltip>
            )}

            {/* Readiness-gated easing indicator (adaptive arc refill) */}
            {workout.adjustment_reason && (
              <Tooltip
                label={
                  <Stack gap={2}>
                    <Text size="xs" fw={600}>Eased for readiness</Text>
                    <Text size="xs">{workout.adjustment_reason}</Text>
                  </Stack>
                }
                position="bottom"
                withArrow
              >
                <Badge
                  size="xs"
                  variant="light"
                  color="teal"
                  leftSection={<Heartbeat size={10} />}
                  style={{ cursor: 'help' }}
                >
                  Eased
                </Badge>
              </Tooltip>
            )}
            {/* Create Route button - only for today or future rides and runs */}
            {!isPast && sessionSport !== 'other' && (
              <Tooltip label="Create route for this workout" withArrow>
                <ActionIcon
                  size="xs"
                  variant="light"
                  color="teal"
                  mt={4}
                  onClick={(e) => handleCreateRoute(e, workout, date)}
                >
                  <Path size={12} />
                </ActionIcon>
              </Tooltip>
            )}
            {/* Compliance: how the day went against the plan, in
                role colours (TrainingPeaks-style bands). */}
            {settled && session.compliance.band !== 'skipped' && (
              <Box
                data-testid="compliance-strip"
                data-band={session.compliance.band}
                title={COMPLIANCE_STYLE[session.compliance.band].label}
                style={{ height: 3, marginTop: 4, background: COMPLIANCE_STYLE[session.compliance.band].strip }}
              />
            )}
            </Box>
          );
        })}

        {/* Rest day indicator */}
        {isRestDay && !raceGoal && (
          <Text size="xs" c="dimmed" fw={500}>Rest</Text>
        )}

        {/* Race Goal indicator */}
        {raceGoal && (
          <Tooltip
            label={`${raceGoal.name}${raceGoal.distance_km ? ` • ${Math.round(raceGoal.distance_km)}km` : ''}${raceGoal.goal_placement ? ` • Goal: ${raceGoal.goal_placement}` : ''}`}
            multiline
            w={200}
          >
            <Box
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                openRaceGoalModal(raceGoal, date);
              }}
            >
              {/* The race stamp — the calendar's one zine moment */}
              <span className="tribos-stamp" style={{ fontSize: 15, padding: '2px 8px', margin: '2px 0 4px' }}>
                Race day · {raceGoal.priority}
              </span>
              <Text
                size="xs"
                fw={600}
                lineClamp={1}
                mt={2}
                style={{ color: 'var(--color-text-primary)' }}
              >
                {raceGoal.name}
              </Text>
              {raceGoal.race_type && (
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {raceGoal.race_type.replace('_', ' ')}
                </Text>
              )}
            </Box>
          </Tooltip>
        )}

        {/* Completed activities */}
        {dayRides.length > 0 && (() => {
          const rides = dayRides.filter(r => getActivitySport(r) === 'cycling');
          const runs = dayRides.filter(r => getActivitySport(r) === 'running');
          const others = dayRides.filter(r => getActivitySport(r) === 'other');
          return (
            <Tooltip label={dayRides.map(r => r.name || 'Activity').join(', ')}>
              <Group gap={4}>
                {rides.length > 0 && (
                  <Badge size="xs" color="green" variant="filled" leftSection={<Bicycle size={10} />}>
                    {rides.length}
                  </Badge>
                )}
                {runs.length > 0 && (
                  <Badge size="xs" color="teal" variant="filled" leftSection={<PersonSimpleRun size={10} />}>
                    {runs.length}
                  </Badge>
                )}
                {others.length > 0 && (
                  <Badge size="xs" color="orange" variant="filled" leftSection={<Heartbeat size={10} />}>
                    {others.length}
                  </Badge>
                )}
                {/* Show Strava logo if any activities are from Strava */}
                {dayRides.some(r => r.provider === 'strava') && (
                  <StravaLogo size={12} />
                )}
              </Group>
            </Tooltip>
          );
        })()}

        {/* Cross-training activities */}
        {(() => {
          const dayCrossTraining = getCrossTrainingForDate(date);
          if (dayCrossTraining.length === 0) return null;

          const totalDuration = dayCrossTraining.reduce((sum, a) => sum + a.duration_minutes, 0);
          const totalTSS = dayCrossTraining.reduce((sum, a) => sum + (a.estimated_tss || 0), 0);

          return (
            <Tooltip
              label={dayCrossTraining.map(a =>
                `${a.activity_type?.name || 'Activity'} - ${a.duration_minutes}min`
              ).join('\n')}
              multiline
            >
              <Box
                onClick={(e) => {
                  e.stopPropagation();
                  openCrossTrainingModal(date);
                }}
                style={{ cursor: 'pointer' }}
              >
                <Group gap={4}>
                  {dayCrossTraining.slice(0, 3).map((activity, idx) => (
                    <Badge
                      key={idx}
                      size="xs"
                      variant="light"
                      color={ACTIVITY_CATEGORIES[activity.activity_type?.category]?.color?.replace('#', '') || 'indigo'}
                      leftSection={getCrossTrainingIcon(activity.activity_type?.category)}
                    >
                      {activity.duration_minutes}m
                    </Badge>
                  ))}
                  {dayCrossTraining.length > 3 && (
                    <Text size="xs" c="dimmed">+{dayCrossTraining.length - 3}</Text>
                  )}
                </Group>
                {totalTSS > 0 && (
                  <Text size="xs" c="indigo" fw={500}>+{Math.round(totalTSS)} RSS</Text>
                )}
              </Box>
            </Tooltip>
          );
        })()}

        {/* Show actual TSS if rides */}
        {dayTSS > 0 && (
          <Text size="xs" fw={500} style={{ color: 'var(--color-signal-text)' }}>{Math.round(dayTSS)} RSS</Text>
        )}

        {dayRides.length > 0 && (
          <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
            {formatDistance(dayRides.reduce((sum, r) => sum + ((r.distance || 0) / 1000), 0))}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
