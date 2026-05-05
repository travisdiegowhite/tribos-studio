/**
 * Block library types for the event-anchored training plan system.
 *
 * Each block defines entry/exit conditions, duration bounds, a session generator,
 * and a daily progression rule. Numeric thresholds reference ctx.coefficients
 * (the user's MastersFactor) so behaviour scales with recovery mode.
 *
 * See spec §2 (Block Library) and §8.2 (Architecture).
 */

import type {
  BlockType,
  IntervalPrescription,
  MastersFactor,
  SessionType,
  SessionPrescription,
  EventTier,
} from '@/types/training';

/**
 * Daily-stats slice the sequencer reads from training_load_daily.
 */
export interface FitnessSnapshot {
  date: string;        // ISO date
  rss: number;
  tfi: number;
  afi: number;
  form_score: number;  // FS = TFI - AFI(yesterday)
}

/**
 * Subjective wellness flag (HRV, RPE, soreness). Optional — not all
 * users supply this data, so block logic must degrade gracefully.
 */
export interface SubjectiveSignals {
  hrv_baseline_sd?: number;     // standard deviations from 7-day baseline
  wellness_score?: number;      // 1–10
  muscle_soreness_flag?: boolean;
  date: string;
}

/**
 * Race calendar entry projected forward from race_goals.
 */
export interface CalendarEvent {
  id: string;
  date: string;        // ISO date of the race
  name: string;
  tier: EventTier;
  status: 'upcoming' | 'completed' | 'cancelled' | 'dns';
}

/**
 * Recent activity summary used for entry/exit gating.
 * Populated from activities + activity_efi.
 */
export interface RecentActivitySummary {
  /** Single-event RSS in the prior 24h. */
  max_rss_24h: number;
  /** Cumulative RSS in the prior 72h. */
  cumulative_rss_72h: number;
  /** Days since the last race (any tier). */
  days_since_last_race: number | null;
  /** Most recent EFI decoupling on a long Z2 ride (0–1). */
  recent_efi_decoupling: number | null;
  /** Days since last FTP estimate (used to gate threshold block entry). */
  days_since_ftp_estimate: number | null;
}

/**
 * Full context passed into block library functions.
 */
export interface SequencerContext {
  user_id: string;
  today: string; // ISO date
  ftp_watts: number | null;
  coefficients: MastersFactor;
  /** Last ~14 days of daily-stats; index 0 is today (or most recent). */
  daily_stats: FitnessSnapshot[];
  subjective: SubjectiveSignals[];
  upcoming_events: CalendarEvent[];
  recent_activity: RecentActivitySummary;
  /** Block currently in progress (or just completed), if any. */
  current_block: { block_type: BlockType; days_in: number } | null;
  /** Anchor event for plan generation (Phase 2+). Phase 1 = null. */
  horizon_event: CalendarEvent | null;
  /** Pre-race tier when the entry/exit gate references "post-race". */
  post_race_tier: EventTier | null;
}

/**
 * Output of block.generate_sessions — a flat array of per-day prescriptions.
 * The sequencer is responsible for inserting/updating session_prescriptions rows.
 */
export interface GeneratedSession {
  date: string;
  session_type: SessionType;
  target_rss: number;
  target_duration_min: number;
  prescribed_intervals: IntervalPrescription[] | null;
  long_ride_flag: boolean;
  notes: string;
}

/**
 * Static block definition. One per BlockType; composed in BLOCK_LIBRARY.
 */
export interface BlockDefinition {
  type: BlockType;

  /**
   * Whether this block can be entered from the current ctx state.
   * Spec §2.x "Entry conditions".
   */
  entry_conditions: (ctx: SequencerContext) => boolean;

  /**
   * Whether the block has met its exit criteria (spec §2.x "Exit conditions").
   * Called at block-end boundary.
   */
  exit_conditions: (ctx: SequencerContext) => boolean;

  /**
   * Hard min/max duration in days. Sequencer must clamp within this range.
   */
  duration_range: [number, number];

  /**
   * Default duration given the user's coefficients + ctx (e.g., A-race recovery
   * defaults longer than C-race recovery).
   */
  default_duration: (ctx: SequencerContext) => number;

  /**
   * Build the full per-day session prescription for this block. Pure function.
   * Length of returned array = number of days from start to end inclusive.
   */
  generate_sessions: (
    start: string,
    end: string,
    ctx: SequencerContext
  ) => GeneratedSession[];

  /**
   * Daily refinement applied on top of the static menu (spec §2.x "Progression rule").
   * Called per-day during /sequencer-today and /sequencer-recompute-prescription.
   * Receives the previously-generated prescription for the day and an updated ctx;
   * returns either the same prescription, a substituted one, or null to defer.
   */
  progression_rule: (
    base: GeneratedSession,
    ctx: SequencerContext,
    day_index: number
  ) => GeneratedSession;
}

/**
 * Helper: emit a flat list of ISO date strings from start to end inclusive.
 */
export function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  const startDate = new Date(start + 'T00:00:00Z');
  const endDate = new Date(end + 'T00:00:00Z');
  for (
    let d = new Date(startDate);
    d <= endDate;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Helper: most recent fitness snapshot. Returns null if ctx has no stats.
 */
export function latestSnapshot(ctx: SequencerContext): FitnessSnapshot | null {
  return ctx.daily_stats.length > 0 ? ctx.daily_stats[0] : null;
}

/**
 * Helper: 4-day AFI growth ratio. Returns 0 when not enough data.
 */
export function afiGrowth4d(ctx: SequencerContext): number {
  if (ctx.daily_stats.length < 5) return 0;
  const today = ctx.daily_stats[0].afi;
  const fourDaysAgo = ctx.daily_stats[4].afi;
  if (fourDaysAgo <= 0) return 0;
  return (today - fourDaysAgo) / fourDaysAgo;
}

/**
 * Helper: AFI:TFI ratio from latest snapshot. Returns Infinity when TFI <= 0.
 */
export function afiTfiRatio(ctx: SequencerContext): number {
  const snap = latestSnapshot(ctx);
  if (!snap || snap.tfi <= 0) return Infinity;
  return snap.afi / snap.tfi;
}

/**
 * Resolve a session-type label (used by sequencer when persisting).
 */
export function sessionTypeLabel(t: SessionType): string {
  const map: Record<SessionType, string> = {
    rest: 'Rest',
    z1: 'Easy Z1',
    z2: 'Endurance Z2',
    tempo: 'Tempo',
    threshold: 'Threshold',
    vo2: 'VO2 Max',
    race_sim: 'Race Simulation',
    opener: 'Opener',
  };
  return map[t];
}

/**
 * Default MastersFactor objects per spec §3.3. Used when seeding new users
 * before they choose a recovery_mode in onboarding.
 */
export const MASTERS_FACTOR_DEFAULTS: Record<
  'standard' | 'conservative' | 'adaptive',
  MastersFactor
> = {
  standard: {
    recovery_block_days_added: 0,
    hit_spacing_hours: 36,
    afi_growth_ceiling_4d: 0.25,
    afi_tfi_gate: 1.10,
    fs_recovery_target: -5,
  },
  conservative: {
    recovery_block_days_added: 1,
    hit_spacing_hours: 48,
    afi_growth_ceiling_4d: 0.20,
    afi_tfi_gate: 1.10,
    fs_recovery_target: -7,
  },
  adaptive: {
    recovery_block_days_added: 0,
    hit_spacing_hours: 36,
    afi_growth_ceiling_4d: 0.20,
    afi_tfi_gate: 1.05,
    fs_recovery_target: -3,
  },
};
