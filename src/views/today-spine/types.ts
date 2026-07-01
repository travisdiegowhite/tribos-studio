/**
 * Today — Training-Arc Spine: the single data contract.
 *
 * A redesign of the Today page built around a scrubbable fitness timeline (see
 * docs/today-view). Every zone binds to one `SpineData` object produced by
 * `getTodaySpine()` — no zone fetches its own truth (same principle as the
 * routing-first glance's getToday()).
 *
 * Terminology mirrors the app: canonical TFI / AFI / Form Score (FS) / RSS read
 * canonical-first with legacy fallback (tfi ?? ctl, afi ?? atl, form_score ??
 * tsb, rss ?? tss) per CLAUDE.md. The prototype's TSB/CTL/ATL labels are just
 * the on-screen display of FS/TFI/AFI.
 */

import type { RecentRide } from '../today/shared/recentRides';

export type { RecentRide };

/** Per-day zone/activity chip shown in the node's teal header. */
export interface DayActivity {
  /** 'PLAN' | 'REST' | 'Z1'..'Z4' | 'RIDE'. */
  tag: string;
  name: string;
  /** e.g. '2h00 · 86 RSS' or '32 km · ~195W'. */
  meta: string;
  /** Hex for the chip text (varies by zone), per the design tokens. */
  tagColor: string;
}

/**
 * One day on the spine. Indices 0..todayIndex are real/observed; indices past
 * todayIndex are the forward projection (dashed line, planned bars). Future days
 * are never selectable — you can't have a "state" that hasn't happened.
 */
export interface DayNode {
  index: number; // 0-based position in `days`
  date: string; // YYYY-MM-DD
  /** 'TUE 30 JUN' — pre-formatted for the date flag + node header. */
  dateLabel: string;
  isFuture: boolean;
  tfi: number; // Training Fitness Index (displayed as CTL)
  afi: number; // Acute Fatigue Index (displayed as ATL)
  fs: number; // Form Score = TFI − AFI (displayed as TSB)
  rss: number; // daily load (0 on a rest day); planned target on future days
  readiness: number; // derived from FS, clamped 28..96
  volHours: number; // rolling 7-day ride time, hours
  activity: DayActivity;
}

/** Goal event (A-race etc.) rendered as the coral flag at the right of the arc. */
export interface SpineEvent {
  name: string;
  date: string; // YYYY-MM-DD
  daysToRace: number;
  priority: string | null;
}

/** This-week aggregates for the map overlay chips. */
export interface WeekRollup {
  distanceKm: number;
  distanceMi: number;
  elevationM: number;
  elevationFt: number;
  rideCount: number;
}

/** Persona + the recommendation block seed for the coach zone. */
export interface CoachSeed {
  personaId: string;
  personaName: string;
  /** One-line take (deferred; null on the shell / while loading). */
  oneLineTake: string | null;
  /** "Today's call" recommendation title, e.g. today's workout name. */
  recTitle: string;
  /** Recommendation body sentence. */
  recBody: string;
}

// ── The object ──────────────────────────────────────────────────────────────
export interface SpineData {
  /** 43 past days (index 0..42) + 21 projected days (43..63), ascending. */
  days: DayNode[];
  /** Index of "today" in `days` (the scrub upper bound). */
  todayIndex: number;
  event: SpineEvent | null;
  weekRollup: WeekRollup;
  recentRides: RecentRide[];
  coach: CoachSeed;
  /** Header one-liner, e.g. 'Peak lands in 9 days, right on the gran fondo.' */
  summaryLine: string | null;
  /** False when the athlete has too little history to draw a meaningful arc. */
  hasHistory: boolean;
}
