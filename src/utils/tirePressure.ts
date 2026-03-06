/**
 * Tire Pressure Calculation Utilities
 * Based on Frank Berto's research and SRAM/Silca recommendations.
 * Provides deterministic pressure calculations factoring in rider weight,
 * tire width, surface type, tubeless setup, temperature, and rim width.
 */

// ============================================================
// TYPES
// ============================================================

export type Surface = 'paved' | 'gravel' | 'mixed' | 'unpaved';

export interface TirePressureInput {
  riderWeightKg: number;
  bikeWeightKg?: number;
  tireWidthMm: number;
  surface: Surface;
  tubeless: boolean;
  temperatureCelsius?: number;
  rimWidthMm?: number;
  maxPressurePsi?: number;
}

export interface TirePressureResult {
  frontPsi: number;
  rearPsi: number;
  frontBar: number;
  rearBar: number;
  surface: Surface;
  tireWidth: number;
  tubeless: boolean;
  temperatureAdjusted: boolean;
  warnings: string[];
}

// ============================================================
// CONSTANTS
// ============================================================

const KG_TO_LBS = 2.20462;
const PSI_TO_BAR = 0.0689476;
const DEFAULT_BIKE_WEIGHT_KG = 9;

// Pressure split: rear runs ~7% higher than base, front ~7% lower
// This models the typical 40/60 weight distribution on a road bike
// but produces a realistic 8-12 PSI differential instead of an extreme gap
const PRESSURE_SPLIT = { front: 0.93, rear: 1.07 };

// Surface modifiers reduce pressure on rougher terrain for better grip/comfort
const SURFACE_MODIFIERS: Record<Surface, number> = {
  paved: 1.0,
  mixed: 0.95,
  gravel: 0.82,
  unpaved: 0.78,
};

// Tubeless tires can safely run ~8% lower thanks to no pinch-flat risk
const TUBELESS_MODIFIER = 0.92;

// Temperature correction: ~1 PSI per 10°F deviation from 70°F (21°C)
// This is based on the ideal gas law (PV = nRT)
const REFERENCE_TEMP_C = 21;
const PSI_PER_DEGREE_C = 0.18;

// ============================================================
// INTERNAL HELPERS
// ============================================================

/**
 * Width-dependent coefficient calibrated for common tire sizes.
 * Narrower tires need proportionally higher pressure.
 * Calibrated so a 75kg rider on 28mm clinchers gets ~69F/79R PSI.
 */
function getWidthCoefficient(widthMm: number): number {
  if (widthMm <= 23) return 1.25;
  if (widthMm <= 25) return 1.18;
  if (widthMm <= 28) return 1.12;
  if (widthMm <= 32) return 1.00;
  if (widthMm <= 35) return 0.92;
  if (widthMm <= 40) return 0.83;
  if (widthMm <= 45) return 0.72;
  return 0.62; // 50mm+
}

/**
 * Reasonable pressure floor/ceiling based on tire width.
 */
function getClampRange(widthMm: number): { min: number; max: number } {
  if (widthMm >= 40) return { min: 25, max: 55 };
  if (widthMm >= 32) return { min: 35, max: 75 };
  return { min: 50, max: 120 };
}

/**
 * Temperature-based pressure adjustment.
 * Cold air contracts → need more pressure at pump time.
 * Hot air expands → need less pressure at pump time.
 */
function temperatureAdjustment(tempC: number): number {
  return (REFERENCE_TEMP_C - tempC) * PSI_PER_DEGREE_C;
}

/**
 * Rim width correction: wider rims spread the tire, slightly reducing
 * the optimal pressure. ~1 PSI reduction per 2mm of extra rim width
 * beyond a baseline of 17mm internal width.
 */
function rimWidthAdjustment(rimWidthMm: number): number {
  const BASELINE_RIM_WIDTH = 17;
  if (rimWidthMm <= BASELINE_RIM_WIDTH) return 0;
  return -((rimWidthMm - BASELINE_RIM_WIDTH) / 2) * 1.0;
}

// ============================================================
// MAIN CALCULATION
// ============================================================

/**
 * Calculate optimal front and rear tire pressure.
 *
 * Algorithm:
 * 1. Convert rider + bike weight to lbs (calculation uses imperial internally)
 * 2. Distribute weight 40/60 front/rear
 * 3. Apply width-dependent coefficient (Frank Berto formula)
 * 4. Apply surface modifier (rougher terrain → lower pressure)
 * 5. Apply tubeless modifier (-8%)
 * 6. Apply rim width adjustment if available
 * 7. Apply temperature correction if weather data available
 * 8. Clamp to safe range and check against tire max rated pressure
 */
export function calculateTirePressure(input: TirePressureInput): TirePressureResult {
  const {
    riderWeightKg,
    bikeWeightKg = DEFAULT_BIKE_WEIGHT_KG,
    tireWidthMm,
    surface,
    tubeless,
    temperatureCelsius,
    rimWidthMm,
    maxPressurePsi,
  } = input;

  const warnings: string[] = [];

  // Convert to lbs for the Berto formula
  const totalWeightLbs = (riderWeightKg + bikeWeightKg) * KG_TO_LBS;

  const k = getWidthCoefficient(tireWidthMm);

  // Base pressure from total system weight and tire width
  const basePsi = (totalWeightLbs / tireWidthMm) * k * 10;

  // Apply front/rear split (~7% differential mirrors 40/60 weight distribution)
  let frontPsi = basePsi * PRESSURE_SPLIT.front;
  let rearPsi = basePsi * PRESSURE_SPLIT.rear;

  // Surface modifier
  const surfaceMod = SURFACE_MODIFIERS[surface] ?? 1.0;
  frontPsi *= surfaceMod;
  rearPsi *= surfaceMod;

  // Tubeless modifier
  if (tubeless) {
    frontPsi *= TUBELESS_MODIFIER;
    rearPsi *= TUBELESS_MODIFIER;
  }

  // Rim width adjustment
  if (rimWidthMm != null && rimWidthMm > 0) {
    const rimAdj = rimWidthAdjustment(rimWidthMm);
    frontPsi += rimAdj;
    rearPsi += rimAdj;
  }

  // Temperature correction
  let temperatureAdjusted = false;
  if (temperatureCelsius != null) {
    const tempAdj = temperatureAdjustment(temperatureCelsius);
    frontPsi += tempAdj;
    rearPsi += tempAdj;
    temperatureAdjusted = true;

    if (temperatureCelsius < 5) {
      warnings.push('Cold weather: check pressure before your ride');
    } else if (temperatureCelsius > 35) {
      warnings.push('Hot weather: pressure may increase during your ride');
    }
  }

  // Clamp to safe range
  const { min, max } = getClampRange(tireWidthMm);
  frontPsi = Math.max(min, Math.min(max, frontPsi));
  rearPsi = Math.max(min, Math.min(max, rearPsi));

  // Check against tire max rated pressure
  if (maxPressurePsi != null && maxPressurePsi > 0) {
    if (rearPsi > maxPressurePsi) {
      warnings.push(`Rear exceeds max rated pressure (${maxPressurePsi} PSI)`);
      rearPsi = maxPressurePsi;
    }
    if (frontPsi > maxPressurePsi) {
      warnings.push(`Front exceeds max rated pressure (${maxPressurePsi} PSI)`);
      frontPsi = maxPressurePsi;
    }
    if (rearPsi > maxPressurePsi * 0.9 && !warnings.some(w => w.includes('exceeds'))) {
      warnings.push('Near max rated tire pressure');
    }
  }

  return {
    frontPsi: Math.round(frontPsi),
    rearPsi: Math.round(rearPsi),
    frontBar: parseFloat((frontPsi * PSI_TO_BAR).toFixed(1)),
    rearBar: parseFloat((rearPsi * PSI_TO_BAR).toFixed(1)),
    surface,
    tireWidth: tireWidthMm,
    tubeless,
    temperatureAdjusted,
    warnings,
  };
}

// ============================================================
// CONVENIENCE FUNCTIONS
// ============================================================

/**
 * Map route surface_type (road/gravel/mountain) to pressure surface categories.
 */
export function mapRouteSurfaceToPressSurface(routeProfile: string): Surface {
  switch (routeProfile?.toLowerCase()) {
    case 'road':
    case 'paved':
    case 'bike':
      return 'paved';
    case 'gravel':
      return 'gravel';
    case 'mixed':
      return 'mixed';
    case 'mountain':
    case 'mtb':
    case 'unpaved':
    case 'dirt':
      return 'unpaved';
    default:
      return 'mixed';
  }
}

/**
 * Format a PSI value to the user's preferred unit.
 */
export function formatPressure(psi: number, unit: 'psi' | 'bar'): string {
  if (unit === 'bar') {
    return `${(psi * PSI_TO_BAR).toFixed(1)} bar`;
  }
  return `${Math.round(psi)} PSI`;
}

/**
 * Get a human-readable summary of the pressure recommendation.
 */
export function formatPressureSummary(result: TirePressureResult, unit: 'psi' | 'bar'): string {
  const front = formatPressure(result.frontPsi, unit);
  const rear = formatPressure(result.rearPsi, unit);
  const tireDesc = `${result.tireWidth}c ${result.tubeless ? 'tubeless' : 'clincher'}`;
  return `F ${front} / R ${rear} — ${tireDesc} on ${result.surface}`;
}
