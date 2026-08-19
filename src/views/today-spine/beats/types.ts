/**
 * Today on mobile — the four-beat page (docs/today-mobile-beats-spec.md).
 *
 * One view-model per beat, produced by buildBeats() from the page's single
 * SpineData. Components render this and derive nothing: the whole state matrix
 * (§5 of the spec) is therefore testable without React.
 *
 * Beat 2 (the felt-response tap) is not in this slice — `Feel` is defined and
 * threaded through so Beat 3's flat/strong columns exist and are tested now,
 * and PR 2 only has to add the control and its persistence.
 */

/** The Beat 2 answer. Always null in this slice. */
export type Feel = 'flat' | 'normal' | 'strong';

/** Effort bands, matching labelActivity's RSS cuts in getTodaySpine.ts. */
export type EffortTier = 'easy' | 'steady' | 'brisk' | 'hard';

// ── Beat 1 — what you did ───────────────────────────────────────────────────

export type Beat1State = 'ridden-today' | 'recent' | 'gap' | 'long-gap' | 'no-history';

/** One cell of the rolling 7-day rhythm strip. `tier: null` is a rest day. */
export interface RhythmDay {
  date: string; // YYYY-MM-DD
  tier: EffortTier | null;
  isToday: boolean;
}

export interface Beat1VM {
  state: Beat1State;
  line: string;
  /** Google-encoded geometry for the trace glyph. Null on indoor/no-geo rides. */
  polyline: string | null;
  /** Effort of the recapped ride — colors the trace. Null when there isn't one. */
  tier: EffortTier | null;
  rhythm: RhythmDay[];
}

// ── Beat 3 — what to do ─────────────────────────────────────────────────────

export type Beat3DayType =
  | 'no-history'
  | 'ridden-today'
  | 'rest'
  | 'planned-easy'
  | 'planned-moderate'
  | 'planned-hard'
  | 'no-plan';

/** What the silhouette draws: the session the page is actually endorsing. */
export interface SessionShape {
  /** workout_type, post-downgrade. */
  type: string;
  durationMin: number;
  /** 0..1, drives the silhouette's bar height. */
  intensity: number;
}

export interface Beat3VM {
  dayType: Beat3DayType;
  line: string;
  /** Null on rest / already-ridden / no-history days — nothing to draw. */
  session: SessionShape | null;
  /** True when Feel = Flat traded the planned session for an easier one. */
  downgraded: boolean;
}

// ── Beat 4 — need a route for that? ─────────────────────────────────────────

export type Beat4State = 'route' | 'browse';

export interface Beat4VM {
  state: Beat4State;
  prompt: string;
  ctaLabel: string;
  href: string;
}

// ── The object ──────────────────────────────────────────────────────────────

export interface BeatsVM {
  beat1: Beat1VM;
  beat3: Beat3VM;
  beat4: Beat4VM;
}
