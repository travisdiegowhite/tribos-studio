/**
 * Block library — central registry of every block type.
 *
 * Sequencer code looks up `BLOCK_LIBRARY[block_type]` to access the block's
 * entry/exit gates, duration bounds, session generator, and progression rule.
 */

import type { BlockType } from '@/types/training';
import type { BlockDefinition } from './types';
import { recovery } from './recovery';
import { reactivation } from './reactivation';
import { aerobicBuild } from './aerobicBuild';
import { threshold } from './threshold';
import { vo2 } from './vo2';
import { raceSpecific } from './raceSpecific';
import { taper } from './taper';
import { maintenance } from './maintenance';

export const BLOCK_LIBRARY: Record<BlockType, BlockDefinition> = {
  recovery,
  reactivation,
  aerobic_build: aerobicBuild,
  threshold,
  vo2,
  race_specific: raceSpecific,
  taper,
  maintenance,
};

export type {
  BlockDefinition,
  GeneratedSession,
  SequencerContext,
  FitnessSnapshot,
  SubjectiveSignals,
  CalendarEvent,
  RecentActivitySummary,
} from './types';

export { MASTERS_FACTOR_DEFAULTS, sessionTypeLabel } from './types';
