/**
 * Ride Intensity from effective power and FTP.
 *
 * RI = EP ÷ FTP is the spec definition (TRIBOS_METRICS_SPECIFICATION §3.1), not
 * an estimate. Devices that record a power stream give it to us directly — the
 * FIT parser computes it, so api/fit-upload.js and the Garmin webhook both
 * store it. Strava's webhook does not: it hands us `weighted_average_watts`
 * (Strava's normalized power, written to `effective_power`) and nothing else,
 * so RI was simply never derived on that path.
 *
 * That left ~2% of stored rides carrying a `ride_intensity`, which is why
 * `midZoneShare4wk` returned null for nearly every athlete and TID-1-middle —
 * a *settled* rule about the one training distribution the research is clear
 * on — could effectively never fire.
 *
 * Deliberately does NOT compute RSS. The spec's RSS carries a terrain
 * multiplier built from gradient, steepness and VAM, none of which Strava's
 * summary payload provides cleanly, and per-day load already arrives intact
 * via training_load_daily. Deriving a terrain-less RSS here would put a
 * quietly different number in the same column as the real ones.
 */

/** Below this an FTP is a placeholder or a typo, not a threshold. */
export const MIN_PLAUSIBLE_FTP = 50;
/**
 * Above this an RI is not a ride. Two hours at 2.5x threshold is not a thing a
 * human does; it means the FTP is stale or wrong, and a wrong RI is worse than
 * a missing one because the distribution rules would read it as gospel.
 */
export const MAX_PLAUSIBLE_RI = 2.5;

const num = (v) => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Ride Intensity, or null when it cannot be computed honestly.
 *
 * @param {number|null|undefined} effectivePower  EP in watts (Strava's weighted_average_watts)
 * @param {number|null|undefined} ftp             athlete FTP in watts
 * @returns {number|null} RI rounded to 3dp (the column is NUMERIC(4,3)), or null
 */
export function rideIntensityFrom(effectivePower, ftp) {
  const ep = num(effectivePower);
  const threshold = num(ftp);
  if (ep == null || ep <= 0) return null;
  if (threshold == null || threshold < MIN_PLAUSIBLE_FTP) return null;

  const ri = ep / threshold;
  if (!(ri > 0) || ri > MAX_PLAUSIBLE_RI) return null;
  return Math.round(ri * 1000) / 1000;
}

/**
 * The dual-write pair for an activity row, or an empty object.
 *
 * Returns `{}` rather than `{ ride_intensity: null }` on purpose: these
 * helpers are spread into update payloads, and writing an explicit null would
 * erase a better value that the FIT parser had already stored from the real
 * power stream. Strava merging into an existing Garmin activity is exactly
 * that case.
 *
 * Dual-writes canonical AND legacy per the metrics freeze policy in CLAUDE.md.
 *
 * @returns {{ride_intensity: number, intensity_factor: number}|{}}
 */
export function rideIntensityFields(effectivePower, ftp) {
  const ri = rideIntensityFrom(effectivePower, ftp);
  if (ri == null) return {};
  return { ride_intensity: ri, intensity_factor: ri };
}
