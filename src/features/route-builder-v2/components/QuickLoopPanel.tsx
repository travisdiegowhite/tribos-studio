/**
 * QuickLoopPanel — a loop by distance and direction, without AI (Phase 2,
 * docs/ROUTE-BUILDER-COMPETITIVE-PLAN.md §3.3).
 *
 * Runs the same comfort ladder as the routing landing (planLandingRoute →
 * planComfortRoute on BRouter with the Tribos profile at the rider's Comfort
 * level), so the loop it returns stays within the comfort check, or it offers
 * honest alternatives, or says why there isn't one. No Claude call, so it
 * isn't capped like AI generation. The chosen loop goes into the builder the
 * same way the landing hands one over (handOffToBuilder).
 */
import { useState } from 'react';
import { Box, Button, NumberInput, SegmentedControl, Text } from '@mantine/core';
import { RB2, RB2_FONT } from './brand';
import { trackRb2 } from '../telemetry/trackRb2';
import { planLandingRoute } from '../../routing-landing/landingEngine';
import { handOffToBuilder } from '../../routing-landing/handOffToBuilder';
import type { LandingSurface } from '../../routing-landing/landingPrefs';
import type { ComfortCandidate, ComfortPlan } from '../../../utils/comfortLadder';
import { comfortChip, type ComfortLevel } from '../../../utils/comfortLevels';
import type { Coordinate } from '../../../types/geo';

const KM_PER_MI = 1.609344;

export const DIRECTION_OPTIONS = [
  { value: '0', label: 'N' },
  { value: '90', label: 'E' },
  { value: '180', label: 'S' },
  { value: '270', label: 'W' },
];

const SURFACE_OPTIONS: Array<{ value: LandingSurface; label: string }> = [
  { value: 'road', label: 'Road' },
  { value: 'gravel', label: 'Gravel' },
  { value: 'mixed', label: 'Mixed' },
];

export interface QuickLoopPanelProps {
  /** Where the loop starts (the rider's location, else the map centre). */
  start: Coordinate | null;
  startLabel: string;
  comfortLevel: ComfortLevel;
  isImperial?: boolean;
  /** Called after the loop is in the store, to fit the map and reset edit history. */
  onApplied: (coordinates: Coordinate[]) => void;
  /** Change the rider's comfort level (a refusal offers the next level up). */
  onComfortLevelChange?: (level: ComfortLevel) => void;
  /** Test seam. */
  planner?: typeof planLandingRoute;
}

type Status = { kind: 'idle' } | { kind: 'working' } | { kind: 'done'; plan: ComfortPlan } | { kind: 'error' };

function distanceLabel(distance_m: number, isImperial: boolean): string {
  return isImperial ? `${(distance_m / 1609.344).toFixed(1)} mi` : `${(distance_m / 1000).toFixed(1)} km`;
}

export function QuickLoopPanel({
  start,
  startLabel,
  comfortLevel,
  isImperial = false,
  onApplied,
  onComfortLevelChange,
  planner = planLandingRoute,
}: QuickLoopPanelProps) {
  const [distance, setDistance] = useState<number>(isImperial ? 30 : 50);
  const [surface, setSurface] = useState<LandingSurface>('road');
  const [direction, setDirection] = useState<string>('0');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const apply = (c: ComfortCandidate) => {
    handOffToBuilder(c, surface);
    onApplied(c.coordinates);
    trackRb2('quick_loop_applied', { kind: c.kind, level: c.level, within_pct: Math.round(c.validation.withinPct) });
  };

  const run = async (level: ComfortLevel = comfortLevel) => {
    if (!start) return;
    setStatus({ kind: 'working' });
    const distanceMi = isImperial ? distance : distance / KM_PER_MI;
    trackRb2('quick_loop_requested', { distance_mi: Math.round(distanceMi), surface, direction, level });
    try {
      const plan = await planner({
        start,
        distanceMi,
        surface,
        comfortLevel: level,
        bearingDeg: Number(direction),
      });
      setStatus({ kind: 'done', plan });
      trackRb2('quick_loop_result', { outcome: plan.outcome, calls: plan.calls });
      if (plan.route) apply(plan.route);
    } catch {
      setStatus({ kind: 'error' });
      trackRb2('quick_loop_result', { outcome: 'error' });
    }
  };

  const label = {
    fontFamily: RB2_FONT.mono,
    fontSize: 10,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: RB2.textTertiary,
    marginBottom: 4,
  };
  const plan = status.kind === 'done' ? status.plan : null;

  return (
    <Box data-testid="rb2-quick-loop">
      <Text style={{ fontFamily: RB2_FONT.body, fontWeight: 700, fontSize: 14, marginBottom: 2 }}>Quick loop</Text>
      <Text style={{ fontSize: 12, color: RB2.textSecondary, marginBottom: 10 }}>
        A loop from {startLabel} at {comfortChip(comfortLevel)}. No AI.
      </Text>

      <Text style={label}>Distance ({isImperial ? 'mi' : 'km'})</Text>
      <NumberInput
        data-testid="rb2-quick-loop-distance"
        value={distance}
        onChange={(v) => setDistance(typeof v === 'number' ? v : Number(v) || 0)}
        min={isImperial ? 5 : 8}
        max={isImperial ? 120 : 200}
        step={5}
        radius={0}
        size="xs"
        mb={10}
        aria-label="Loop distance"
      />

      <Text style={label}>Riding on</Text>
      <SegmentedControl
        data={SURFACE_OPTIONS}
        value={surface}
        onChange={(v) => setSurface(v as LandingSurface)}
        fullWidth
        size="xs"
        radius={0}
        mb={10}
      />

      <Text style={label}>Head out to the</Text>
      <SegmentedControl
        data-testid="rb2-quick-loop-direction"
        data={DIRECTION_OPTIONS}
        value={direction}
        onChange={setDirection}
        fullWidth
        size="xs"
        radius={0}
        mb={12}
      />

      <Button
        data-testid="rb2-quick-loop-go"
        onClick={() => void run()}
        loading={status.kind === 'working'}
        disabled={!start || !(distance > 0)}
        fullWidth
        radius={0}
      >
        Make a loop
      </Button>
      {!start && (
        <Text style={{ fontSize: 12, color: RB2.textSecondary, marginTop: 6 }}>
          Move the map or allow your location to set a start.
        </Text>
      )}

      {status.kind === 'error' && (
        <Text role="alert" style={{ fontSize: 12, marginTop: 8 }}>
          We couldn’t reach the routing service. Try again in a moment.
        </Text>
      )}

      {plan && plan.outcome !== 'ok' && (
        <Box style={{ marginTop: 10 }} aria-live="polite">
          {plan.outcome === 'alternatives' && (
            <>
              <Text style={{ fontSize: 12, color: RB2.textSecondary, marginBottom: 6 }}>
                No loop at your comfort at this distance and direction. These ones are:
              </Text>
              {plan.alternatives.map((a, i) => (
                <Button
                  key={`${a.kind}-${i}`}
                  variant="default"
                  radius={0}
                  size="xs"
                  fullWidth
                  mb={6}
                  onClick={() => apply(a)}
                  styles={{ label: { whiteSpace: 'normal', textAlign: 'left' } }}
                >
                  {a.note || 'Another loop'} · {Math.round(a.validation.withinPct)}% within Comfort {a.level} ·{' '}
                  {distanceLabel(a.distance_m, isImperial)}
                </Button>
              ))}
            </>
          )}
          {plan.outcome === 'refused' && plan.refusal && (
            <>
              <Text style={{ fontSize: 12, marginBottom: 6 }}>{plan.refusal.message}</Text>
              {plan.refusal.shorter && (
                <Button variant="default" radius={0} size="xs" fullWidth mb={6} onClick={() => apply(plan.refusal!.shorter!)}>
                  Ride the shorter loop ({distanceLabel(plan.refusal.shorter.distance_m, isImperial)})
                </Button>
              )}
              {plan.refusal.nearbyStart && (
                <Button variant="default" radius={0} size="xs" fullWidth mb={6} onClick={() => apply(plan.refusal!.nearbyStart!)}>
                  Start from the nearby spot ({plan.refusal.nearbyStart.note})
                </Button>
              )}
              {plan.refusal.tryLevel && (
                <Button
                  variant="default"
                  radius={0}
                  size="xs"
                  fullWidth
                  onClick={() => {
                    const next = plan.refusal!.tryLevel!;
                    onComfortLevelChange?.(next);
                    void run(next);
                  }}
                >
                  Try Comfort {plan.refusal.tryLevel}
                </Button>
              )}
            </>
          )}
        </Box>
      )}
    </Box>
  );
}

export default QuickLoopPanel;
