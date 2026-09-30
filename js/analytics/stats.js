/**
 * 5-Number Summary & Boxplot Statistics Module for SwimCoach Tracker
 *
 * Computes descriptive statistics for lap timing distributions:
 *   - Count
 *   - Minimum (Min)
 *   - First Quartile (Q1, 25th percentile)
 *   - Median (Q2, 50th percentile)
 *   - Third Quartile (Q3, 75th percentile)
 *   - Maximum (Max)
 *   - Interquartile Range (IQR = Q3 - Q1)
 *   - Tukey Fences (Lower: Q1 - 1.5*IQR, Upper: Q3 + 1.5*IQR)
 *   - Outlier detection via Tukey fences
 */

/**
 * Calculates the median of an already-sorted array of numbers.
 *
 * @param {number[]} sortedArr - Ascending sorted numbers
 * @returns {number} Median value
 */
export function calculateMedian(sortedArr) {
  const len = sortedArr.length;
  if (len === 0) return 0;
  const mid = Math.floor(len / 2);
  if (len % 2 !== 0) {
    return sortedArr[mid];
  }
  return (sortedArr[mid - 1] + sortedArr[mid]) / 2;
}

/**
 * Computes 5-number summary and boxplot statistics for a series of lap times.
 *
 * @param {number[]} lapsSeconds - Array of lap times in seconds
 * @returns {{
 *   count: number,
 *   min: number | null,
 *   q1: number | null,
 *   median: number | null,
 *   q3: number | null,
 *   max: number | null,
 *   iqr: number,
 *   lowerFence: number | null,
 *   upperFence: number | null,
 *   outliers: number[]
 * }}
 */
export function computeBoxplotStats(lapsSeconds) {
  if (!Array.isArray(lapsSeconds) || lapsSeconds.length === 0) {
    return {
      count: 0,
      min: null,
      q1: null,
      median: null,
      q3: null,
      max: null,
      iqr: 0,
      lowerFence: null,
      upperFence: null,
      outliers: [],
    };
  }

  // Filter valid numbers and sort ascending
  const sorted = lapsSeconds
    .filter((x) => typeof x === 'number' && Number.isFinite(x) && !Number.isNaN(x))
    .sort((a, b) => a - b);

  const count = sorted.length;
  if (count === 0) {
    return {
      count: 0,
      min: null,
      q1: null,
      median: null,
      q3: null,
      max: null,
      iqr: 0,
      lowerFence: null,
      upperFence: null,
      outliers: [],
    };
  }

  const min = sorted[0];
  const max = sorted[count - 1];

  if (count === 1) {
    return {
      count: 1,
      min,
      q1: min,
      median: min,
      q3: min,
      max,
      iqr: 0,
      lowerFence: min,
      upperFence: max,
      outliers: [],
    };
  }

  // Calculate Median (Q2)
  const mid = Math.floor(count / 2);
  const median = count % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // Tukey's hinges: lower half and upper half excluding median when count is odd
  const lowerHalf = sorted.slice(0, mid);
  const upperHalf = count % 2 !== 0 ? sorted.slice(mid + 1) : sorted.slice(mid);

  const q1 = calculateMedian(lowerHalf);
  const q3 = calculateMedian(upperHalf);
  const iqr = q3 - q1;

  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;

  // Identify outliers beyond Tukey fences
  // When IQR is 0 (e.g. [45, 45, 45, 45]), fences equal the identical values, so no outliers exist
  let outliers = [];
  if (iqr > 0) {
    outliers = sorted.filter((val) => val < lowerFence || val > upperFence);
  }

  return {
    count,
    min,
    q1,
    median,
    q3,
    max,
    iqr,
    lowerFence,
    upperFence,
    outliers,
  };
}
