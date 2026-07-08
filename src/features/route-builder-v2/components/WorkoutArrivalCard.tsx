/**
 * WorkoutArrivalCard — the interactive landing step when the rider arrives at
 * the builder from the training calendar ("create a route" on a workout).
 *
 * Instead of dropping them onto a blank map, ask how they want to ride
 * today's workout:
 *   - build something new (with an optional start-location preference that
 *     seeds the generate form),
 *   - reuse a saved route (opens Discover, ranked by today's target),
 *   - repeat a past ride (loads it as an editable route they can tweak).
 *
 * Presentational + local step state only; the page owns data fetching and
 * what each choice actually does.
 */

import { useState } from 'react';
import { Box, Group, Loader, Text, TextInput, UnstyledButton } from '@mantine/core';
import {
  ArrowCounterClockwise,
  ArrowLeft,
  FolderOpen,
  Sparkle,
  X,
} from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';

export interface PastRideOption {
  id: string;
  name: string | null;
  startDate: string | null;
  distanceKm: number | null;
}

export interface WorkoutArrivalCardProps {
  /** Workout name from the calendar (or a goal label fallback). */
  workoutLabel: string | null;
  /** Short target line, e.g. "75 min · ~40 km". */
  detailLabel: string | null;
  /** "Something new" — carries the optional typed start-location preference. */
  onChooseNew: (startLocation: string) => void;
  /** "A saved route" — the page opens the Discover surface. */
  onChooseSaved: () => void;
  /** Lazy trigger to fetch recent rides when the past-ride step opens. */
  onLoadPastRides: () => void;
  pastRides: PastRideOption[];
  pastRidesLoading: boolean;
  onPickPastRide: (id: string) => void;
  onDismiss: () => void;
  isImperial?: boolean;
}

function formatDistance(distanceKm: number | null, isImperial: boolean): string {
  if (distanceKm == null) return '';
  return isImperial
    ? `${Math.round(distanceKm * 0.621371)} mi`
    : `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`;
}

function formatRideDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const optionButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: `1px solid ${RB2.border}`,
  backgroundColor: RB2.bgSecondary,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  textAlign: 'left',
};

function OptionButton({
  testId,
  icon,
  title,
  subtitle,
  onClick,
}: {
  testId: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <UnstyledButton data-testid={testId} onClick={onClick} style={optionButtonStyle}>
      <Box style={{ flexShrink: 0, marginTop: 2 }}>{icon}</Box>
      <Box style={{ minWidth: 0 }}>
        <Text
          style={{
            fontFamily: RB2_FONT.heading,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.03em',
            color: RB2.textPrimary,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontFamily: RB2_FONT.body,
            fontSize: 12,
            color: RB2.textSecondary,
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </Text>
      </Box>
    </UnstyledButton>
  );
}

export function WorkoutArrivalCard({
  workoutLabel,
  detailLabel,
  onChooseNew,
  onChooseSaved,
  onLoadPastRides,
  pastRides,
  pastRidesLoading,
  onPickPastRide,
  onDismiss,
  isImperial = false,
}: WorkoutArrivalCardProps) {
  const [step, setStep] = useState<'choice' | 'past'>('choice');
  const [startLocation, setStartLocation] = useState('');

  const openPastStep = () => {
    onLoadPastRides();
    setStep('past');
  };

  return (
    <Box
      data-testid="rb2-workout-arrival"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(400px, calc(100% - 24px))',
        maxHeight: 'calc(100% - 24px)',
        overflowY: 'auto',
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        borderRadius: 0,
        padding: '18px 20px',
        boxShadow: RB2.shadowOverlay,
        zIndex: 30,
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb={4}>
        <Box style={{ minWidth: 0 }}>
          <Text
            style={{
              fontFamily: RB2_FONT.mono,
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: RB2.textTertiary,
            }}
          >
            Today&rsquo;s workout
          </Text>
          <Text
            data-testid="rb2-workout-arrival-title"
            style={{
              fontFamily: RB2_FONT.heading,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '0.03em',
              color: RB2.textPrimary,
            }}
          >
            {workoutLabel || 'Planned ride'}
          </Text>
          {detailLabel && (
            <Text
              style={{
                fontFamily: RB2_FONT.mono,
                fontSize: 11,
                color: RB2.textSecondary,
                marginTop: 2,
              }}
            >
              {detailLabel}
            </Text>
          )}
        </Box>
        <UnstyledButton
          data-testid="rb2-workout-arrival-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{ flexShrink: 0, padding: 4 }}
        >
          <X size={16} color={RB2.textSecondary} />
        </UnstyledButton>
      </Group>

      {step === 'choice' ? (
        <>
          <Text
            style={{
              fontFamily: RB2_FONT.body,
              fontSize: 13,
              color: RB2.textSecondary,
              margin: '6px 0 12px',
            }}
          >
            How do you want to ride it?
          </Text>

          <Box style={{ marginBottom: 12 }}>
            <Text
              style={{
                fontFamily: RB2_FONT.mono,
                fontSize: 9,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: RB2.textTertiary,
                marginBottom: 3,
              }}
            >
              Anywhere in particular? (optional)
            </Text>
            <TextInput
              data-testid="rb2-workout-arrival-start"
              value={startLocation}
              onChange={(e) => setStartLocation(e.currentTarget.value)}
              placeholder="Address or place — blank uses your location"
              styles={{ input: { borderRadius: 0, fontSize: 13 } }}
            />
          </Box>

          <Box style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <OptionButton
              testId="rb2-workout-arrival-new"
              icon={<Sparkle size={18} color={RB2.teal} weight="duotone" />}
              title="Build something new"
              subtitle="Generate a fresh route sized to this workout."
              onClick={() => onChooseNew(startLocation.trim())}
            />
            <OptionButton
              testId="rb2-workout-arrival-saved"
              icon={<FolderOpen size={18} color={RB2.teal} weight="duotone" />}
              title="Use a saved route"
              subtitle="Pick from your routes, ranked by today's target."
              onClick={onChooseSaved}
            />
            <OptionButton
              testId="rb2-workout-arrival-past"
              icon={<ArrowCounterClockwise size={18} color={RB2.teal} weight="duotone" />}
              title="Repeat a past ride"
              subtitle="Load an old ride as a route — ride it as-is or tweak it."
              onClick={openPastStep}
            />
          </Box>
        </>
      ) : (
        <>
          <UnstyledButton
            data-testid="rb2-workout-arrival-back"
            onClick={() => setStep('choice')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              margin: '8px 0 10px',
            }}
          >
            <ArrowLeft size={12} color={RB2.textSecondary} />
            <Text
              style={{
                fontFamily: RB2_FONT.mono,
                fontSize: 10,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: RB2.textSecondary,
              }}
            >
              Back
            </Text>
          </UnstyledButton>

          {pastRidesLoading ? (
            <Group justify="center" py="md">
              <Loader size="sm" />
            </Group>
          ) : pastRides.length === 0 ? (
            <Text
              data-testid="rb2-workout-arrival-past-empty"
              style={{ fontFamily: RB2_FONT.body, fontSize: 13, color: RB2.textTertiary }}
            >
              No past rides with a GPS track yet — sync an activity or build
              something new instead.
            </Text>
          ) : (
            <Box style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pastRides.map((ride) => (
                <UnstyledButton
                  key={ride.id}
                  data-testid={`rb2-workout-arrival-ride-${ride.id}`}
                  onClick={() => onPickPastRide(ride.id)}
                  style={{
                    padding: '8px 10px',
                    border: `1px solid ${RB2.border}`,
                    backgroundColor: RB2.bgSecondary,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: RB2_FONT.body,
                      fontSize: 13,
                      fontWeight: 600,
                      color: RB2.textPrimary,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {ride.name || 'Untitled ride'}
                  </Text>
                  <Text
                    style={{ fontFamily: RB2_FONT.mono, fontSize: 11, color: RB2.textTertiary }}
                  >
                    {[formatRideDate(ride.startDate), formatDistance(ride.distanceKm, isImperial)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </UnstyledButton>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

export default WorkoutArrivalCard;
