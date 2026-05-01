/**
 * Today View — Vocabulary Mappings
 *
 * Pure deterministic functions that translate numeric / structured signals
 * into the small set of canonical Tribos words the Today view surfaces.
 *
 * The thresholds below are starting values. If they change, they change in
 * ONE place — every Today component reads through these helpers.
 *
 * Strict rule: never emit TSS / CTL / ATL / TSB / NP / IF in any user-facing
 * string. Always use Tribos vocabulary (RSS, TFI, AFI, FS).
 */

export type FreshnessWord = 'drained' | 'loaded' | 'primed' | 'ready' | 'sharp' | 'stale';

export type ConditionsWord = 'ideal' | 'decent' | 'rough' | 'severe';

export interface CurrentWeatherSlim {
  temperature: number | null;       // °C
  windSpeed: number | null;         // km/h
  conditions?: string | null;       // 'clear', 'clouds', 'rain', 'snow', etc.
  visibility?: number | null;       // km
  description?: string | null;
}

/**
 * Map Form Score → freshness word.
 *
 *   FS < -20 → drained   (deeply over-fatigued)
 *   FS < -10 → loaded    (carrying real load)
 *   FS <  -5 → primed    (good fatigue, productive)
 *   FS <   5 → ready     (balanced, can train)
 *   FS <  15 → sharp     (peak/rested, ready to perform)
 *   FS ≥  15 → stale     (under-trained / detraining)
 */
export function freshnessFromFormScore(fs: number | null | undefined): FreshnessWord | null {
  if (fs == null || !Number.isFinite(fs)) return null;
  if (fs < -20) return 'drained';
  if (fs < -10) return 'loaded';
  if (fs < -5) return 'primed';
  if (fs < 5) return 'ready';
  if (fs < 15) return 'sharp';
  return 'stale';
}

/**
 * Map current weather → conditions word.
 *
 * Inputs are slimmed down to the four signals that change the answer:
 * temperature (°C), wind speed (km/h), conditions ('rain', 'snow', etc.),
 * and visibility (km).
 *
 *   ideal:  18–24°C, wind <16 km/h, no precipitation, vis ≥ 8 km
 *   decent: 4–29°C,  wind <24 km/h, no precipitation
 *   rough:  0–35°C,  or wind 24–40 km/h, or light rain/snow
 *   severe: <0 °C or >35 °C, or wind >40 km/h, or heavy precip
 */
export function conditionsFromWeather(w: CurrentWeatherSlim | null | undefined): ConditionsWord | null {
  if (!w || w.temperature == null) return null;

  const tempC = w.temperature;
  const windKmh = w.windSpeed ?? 0;
  const cond = (w.conditions || '').toLowerCase();
  const desc = (w.description || '').toLowerCase();
  const visKm = w.visibility ?? 10;

  const isHeavyPrecip = /thunderstorm|heavy|extreme|tornado|hurricane|blizzard/.test(desc) || cond === 'thunderstorm';
  const isPrecip = isHeavyPrecip || cond === 'rain' || cond === 'snow' || cond === 'sleet';

  if (tempC < 0 || tempC > 35 || windKmh > 40 || isHeavyPrecip) return 'severe';
  if (tempC < 4 || tempC > 29 || windKmh > 24 || isPrecip || visKm < 3) return 'rough';
  if (tempC < 18 || tempC > 24 || windKmh >= 16 || visKm < 8) return 'decent';
  return 'ideal';
}

/**
 * Color token (CSS variable) for a freshness word — read by StateStrip /
 * any chip that wants to color-code the freshness state.
 */
export const FRESHNESS_COLORS: Record<FreshnessWord, string> = {
  drained: 'var(--color-coral, #C43C2A)',
  loaded: 'var(--color-orange, #D4600A)',
  primed: 'var(--color-gold, #C49A0A)',
  ready: 'var(--color-teal, #2A8C82)',
  sharp: 'var(--color-teal-bright, #36B0A4)',
  stale: 'var(--color-slate, #5A6B7A)',
};

export const CONDITIONS_COLORS: Record<ConditionsWord, string> = {
  ideal: 'var(--color-teal, #2A8C82)',
  decent: 'var(--color-gold, #C49A0A)',
  rough: 'var(--color-orange, #D4600A)',
  severe: 'var(--color-coral, #C43C2A)',
};

/**
 * Color token for the training phase block — used by the WK X / Y cell
 * indicator dots in StateStrip.
 */
export const PHASE_COLORS: Record<string, string> = {
  base: 'var(--color-teal, #2A8C82)',
  build: 'var(--color-gold, #C49A0A)',
  peak: 'var(--color-orange, #D4600A)',
  taper: 'var(--color-coral, #C43C2A)',
  recovery: 'var(--color-slate, #5A6B7A)',
};

/**
 * Workout zone → block bar color, used by WorkoutBlocks.
 */
export function colorForZone(zone: number | null | undefined): string {
  if (zone == null) return 'var(--color-slate, #5A6B7A)';
  if (zone <= 2) return 'var(--color-teal, #2A8C82)';
  if (zone === 3 || zone === 3.5) return 'var(--color-gold, #C49A0A)';
  if (zone === 4) return 'var(--color-orange, #D4600A)';
  return 'var(--color-coral, #C43C2A)';
}
