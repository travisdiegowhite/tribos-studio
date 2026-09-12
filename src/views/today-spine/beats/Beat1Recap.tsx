/**
 * Beat 1 — here's what you did. Always past tense; acknowledges before the
 * page assigns anything. The trace is the sentence's citation.
 */

import { Box } from '@mantine/core';
import { BeatCard, BeatSentence } from './BeatCard';
import { RouteTrace } from './glyphs/RouteTrace';
import { RhythmStrip } from './glyphs/RhythmStrip';
import { C, FONT } from '../tokens';
import type { Beat1VM } from './types';

interface Beat1RecapProps {
  vm: Beat1VM;
  /** Opens the zone-colored map of this ride (behind the numbers door). */
  onSeeMap?: () => void;
}

export function Beat1Recap({ vm, onSeeMap }: Beat1RecapProps) {
  return (
    <BeatCard label="LAST RIDE" accent={C.teal}>
      <BeatSentence>{vm.line}</BeatSentence>
      <RouteTrace polyline={vm.polyline} tier={vm.tier} />
      {vm.polyline && onSeeMap && (
        <Box>
          <Box
            component="button"
            type="button"
            onClick={onSeeMap}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontFamily: FONT.mono,
              fontSize: 11,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: C.teal,
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            See the map
          </Box>
        </Box>
      )}
      <RhythmStrip days={vm.rhythm} />
    </BeatCard>
  );
}
