/**
 * Beat 1 — here's what you did. Always past tense; acknowledges before the
 * page assigns anything. The trace is the sentence's citation.
 */

import { BeatCard, BeatSentence } from './BeatCard';
import { RouteTrace } from './glyphs/RouteTrace';
import { RhythmStrip } from './glyphs/RhythmStrip';
import { C } from '../tokens';
import type { Beat1VM } from './types';

export function Beat1Recap({ vm }: { vm: Beat1VM }) {
  return (
    <BeatCard label="LAST RIDE" accent={C.teal}>
      <BeatSentence>{vm.line}</BeatSentence>
      <RouteTrace polyline={vm.polyline} tier={vm.tier} />
      <RhythmStrip days={vm.rhythm} />
    </BeatCard>
  );
}
