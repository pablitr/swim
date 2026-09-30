/**
 * Training Zones Calculation Module for SwimCoach Tracker
 *
 * Physiological Velocity Formula:
 * In swimming physics, time is inversely proportional to velocity:
 *   Pace = Baseline / (Percentage / 100)
 *
 * Example: For a 60.0s baseline 100m swimmer:
 *   - 75% effort (aerobic recovery) = 60.0 / 0.75 = 80.00s
 *   - 80% effort (aerobic threshold) = 60.0 / 0.80 = 75.00s
 *   - 90% effort (anaerobic threshold) = 60.0 / 0.90 = 66.67s
 *   - 100% effort (target sprint pace) = 60.0 / 1.00 = 60.00s
 *
 * Naive multiplication (baseline * 0.75 = 45.0s) is strictly rejected because
 * a lower time denotes higher velocity (impossible at 75% sub-maximal effort).
 */

/**
 * Standard training zone effort percentages.
 */
export const ZONE_PERCENTAGES = Object.freeze({
  ZONE_75: 0.75,
  ZONE_80: 0.80,
  ZONE_90: 0.90,
  ZONE_100: 1.00,
});

/**
 * Calculates physiological training zones from a 100m baseline time.
 *
 * @param {number} baseline100mSeconds - Baseline 100m time in seconds (must be > 0)
 * @returns {{ zone75: number, zone80: number, zone90: number, zone100: number }}
 * @throws {TypeError|RangeError} If baseline is <= 0, NaN, null, or not a number
 */
export function calculateTrainingZones(baseline100mSeconds) {
  if (
    typeof baseline100mSeconds !== 'number' ||
    Number.isNaN(baseline100mSeconds) ||
    !Number.isFinite(baseline100mSeconds) ||
    baseline100mSeconds <= 0
  ) {
    throw new TypeError(`Invalid baseline: baseline100mSeconds must be a positive number, got ${baseline100mSeconds}`);
  }

  return {
    zone75: baseline100mSeconds / ZONE_PERCENTAGES.ZONE_75,
    zone80: baseline100mSeconds / ZONE_PERCENTAGES.ZONE_80,
    zone90: baseline100mSeconds / ZONE_PERCENTAGES.ZONE_90,
    zone100: baseline100mSeconds / ZONE_PERCENTAGES.ZONE_100,
  };
}
