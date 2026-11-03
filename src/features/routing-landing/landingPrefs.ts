/**
 * What the landing remembers in localStorage (docs/ROUTING-LANDING-SPEC.md §1):
 * the guest's last form values, and whether the first-visit card was seen.
 *
 * Storage can be missing or throw (private windows, blocked site data), so
 * every access is wrapped. If storage can't be read, the first-visit card is
 * NOT shown, rather than shown on every visit.
 */

import type { Coordinate } from '../../types/geo';
import { DEFAULT_COMFORT_LEVEL, isComfortLevel, type ComfortLevel } from '../../utils/comfortLevels';

export type LandingSurface = 'road' | 'gravel' | 'mixed';

export const DISTANCE_OPTIONS_MI = [15, 30, 50, 75] as const;
export type LandingDistanceMi = (typeof DISTANCE_OPTIONS_MI)[number];

export interface LandingForm {
  startLabel: string;
  start: Coordinate | null;
  distanceMi: LandingDistanceMi;
  surface: LandingSurface;
  comfortLevel: ComfortLevel;
}

export const DEFAULT_LANDING_FORM: LandingForm = {
  startLabel: '',
  start: null,
  distanceMi: 30,
  surface: 'road',
  comfortLevel: DEFAULT_COMFORT_LEVEL,
};

const FORM_KEY = 'routing-landing:form:v1';
const SEEN_KEY = 'routing-landing:first-visit-seen:v1';

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function isCoordinate(v: unknown): v is Coordinate {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    Math.abs(v[0]) <= 180 &&
    Math.abs(v[1]) <= 90
  );
}

/** The saved form, each field validated; anything odd falls back to the default. */
export function loadLandingForm(): LandingForm {
  const s = storage();
  if (!s) return { ...DEFAULT_LANDING_FORM };
  try {
    const raw = JSON.parse(s.getItem(FORM_KEY) ?? 'null') as Partial<LandingForm> | null;
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_LANDING_FORM };
    return {
      startLabel: typeof raw.startLabel === 'string' ? raw.startLabel.slice(0, 200) : '',
      start: isCoordinate(raw.start) ? [raw.start[0], raw.start[1]] : null,
      distanceMi: (DISTANCE_OPTIONS_MI as readonly number[]).includes(raw.distanceMi as number)
        ? (raw.distanceMi as LandingDistanceMi)
        : DEFAULT_LANDING_FORM.distanceMi,
      surface: raw.surface === 'road' || raw.surface === 'gravel' || raw.surface === 'mixed' ? raw.surface : 'road',
      comfortLevel: isComfortLevel(raw.comfortLevel) ? raw.comfortLevel : DEFAULT_COMFORT_LEVEL,
    };
  } catch {
    return { ...DEFAULT_LANDING_FORM };
  }
}

export function saveLandingForm(form: LandingForm): void {
  try {
    storage()?.setItem(FORM_KEY, JSON.stringify(form));
  } catch {
    /* storage full or blocked: the form still works */
  }
}

/** True only when storage works and the card hasn't been dismissed. */
export function shouldShowFirstVisitCard(): boolean {
  const s = storage();
  if (!s) return false;
  try {
    return s.getItem(SEEN_KEY) === null;
  } catch {
    return false;
  }
}

export function markFirstVisitCardSeen(): void {
  try {
    storage()?.setItem(SEEN_KEY, new Date().toISOString());
  } catch {
    /* nothing to do */
  }
}
