/**
 * CuesPanel — turn-by-turn cue sheet for the current route.
 *
 * Lists the routing provider's turn cues (store `routeCues`) with distance
 * markers. Only turns and the finish are listed — depart/continue noise is
 * filtered. Cues exist only for roads routed via Stadia/Valhalla; freehand
 * and BRouter routes show the empty state.
 */
import { Box, Text } from '@mantine/core';
import {
  ArrowBendUpLeft,
  ArrowBendUpRight,
  ArrowUUpLeft,
  ArrowUp,
  FlagCheckered,
} from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { convertDistance } from '../../../utils/units.jsx';
import { isTurnCue, type RouteCue } from '../../../utils/routeCues';

export interface CuesPanelProps {
  cues: RouteCue[] | null;
  isImperial?: boolean;
}

function cueIcon(direction: RouteCue['direction']) {
  switch (direction) {
    case 'left':
      return <ArrowBendUpLeft size={16} />;
    case 'right':
      return <ArrowBendUpRight size={16} />;
    case 'uturn':
      return <ArrowUUpLeft size={16} />;
    case 'arrive':
      return <FlagCheckered size={16} />;
    default:
      return <ArrowUp size={16} />;
  }
}

function distanceLabel(km: number, isImperial: boolean): string {
  const value = isImperial ? convertDistance.kmToMiles(km) : km;
  return `${value.toFixed(1)}${isImperial ? 'mi' : 'km'}`;
}

export function CuesPanel({ cues, isImperial = false }: CuesPanelProps) {
  const visible = (cues ?? []).filter((c) => isTurnCue(c) || c.direction === 'arrive');

  if (visible.length === 0) {
    return (
      <Text
        data-testid="rb2-cues-empty"
        style={{ fontFamily: RB2_FONT.body, fontSize: 13, color: RB2.textTertiary }}
      >
        No turn cues for this route yet. Cues appear automatically for
        road-following routes (a few seconds after the route settles) —
        freehand lines don&apos;t have them.
      </Text>
    );
  }

  return (
    <Box data-testid="rb2-cues-panel" style={{ maxHeight: 380, overflowY: 'auto' }}>
      {visible.map((cue, i) => (
        <Box
          key={`${cue.distance_km}-${i}`}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '7px 4px',
            borderBottom: i < visible.length - 1 ? `1px solid ${RB2.border}` : 'none',
          }}
        >
          <Text
            style={{
              fontFamily: RB2_FONT.mono,
              fontSize: 11,
              color: RB2.textTertiary,
              minWidth: 52,
              paddingTop: 1,
            }}
          >
            {distanceLabel(cue.distance_km, isImperial)}
          </Text>
          <Box style={{ color: RB2.teal, flexShrink: 0, paddingTop: 1 }}>
            {cueIcon(cue.direction)}
          </Box>
          <Text
            style={{
              fontFamily: RB2_FONT.body,
              fontSize: 13,
              color: RB2.textPrimary,
              lineHeight: 1.35,
            }}
          >
            {cue.instruction ||
              (cue.streetNames?.[0] ? `onto ${cue.streetNames[0]}` : 'Turn')}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

export default CuesPanel;
