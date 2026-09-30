/**
 * Sustainable Pace & Outlier Detection Module for SwimCoach Tracker
 *
 * Swimming Analytics Engine:
 * During swim sets, athletes often encounter severe anomalous laps due to:
 *   - Lane interference / equipment adjustments
 *   - Coach interruptions or hydration pauses
 *   - Mis-timed touchpad or stopwatch taps
 *
 * Simple arithmetic mean is heavily skewed by such outliers (e.g. [45s, 45s, 46s, 60s]
 * gives an arithmetic mean of 49.0s, which completely misrepresents the athlete's true pace).
 *
 * Solution:
 * 1. Median Absolute Deviation (MAD) modified Z-score ($M_i = 0.6745 \cdot |x_i - \text{median}| / \text{MAD}$),
 *    with threshold 3.0, complemented by Tukey's IQR fences for $N \ge 4$.
 * 2. Continuous modal clustering (binning window 0.25s - 0.5s) on inlier lap times to determine
 *    the representative sustainable pace.
 */

import { calculateMedian, computeBoxplotStats } from './stats.js';

/**
 * Computes modal clustering on continuous inlier lap times.
 *
 * @param {number[]} inliers - Array of inlier lap times in seconds
 * @returns {number|null} Modal or median pace rounded to 2 decimal places
 */
function computeModalClusterPace(inliers) {
  if (!inliers || inliers.length === 0) return null;
  if (inliers.length === 1) return inliers[0];
  if (inliers.length === 2) {
    return Math.round(((inliers[0] + inliers[1]) / 2) * 100) / 100;
  }

  const sorted = [...inliers].sort((a, b) => a - b);
  // Zero variance shortcut
  if (sorted[0] === sorted[sorted.length - 1]) {
    return sorted[0];
  }

  // Continuous modal density estimation:
  // Evaluates density in a sliding window radius of 0.25s (total window width = 0.50s)
  const windowRadius = 0.25;
  const uniqueVals = Array.from(new Set(sorted));

  let maxCount = 0;
  let candidateCenters = [];

  for (const center of uniqueVals) {
    const count = sorted.filter((x) => Math.abs(x - center) <= windowRadius).length;
    if (count > maxCount) {
      maxCount = count;
      candidateCenters = [center];
    } else if (count === maxCount) {
      candidateCenters.push(center);
    }
  }

  const minCenter = Math.min(...candidateCenters);
  const maxCenter = Math.max(...candidateCenters);

  // If the candidate centers are clustered together (single mode)
  if (maxCenter - minCenter <= 2 * windowRadius) {
    const modalPool = sorted.filter((x) =>
      candidateCenters.some((c) => Math.abs(x - c) <= windowRadius)
    );
    const modeMedian = calculateMedian(modalPool);
    return Math.round(modeMedian * 100) / 100;
  }

  // Multimodal tie (e.g. bimodal [40, 40, 50, 50]):
  // Use overall inlier median for robust central tendency
  const overallMedian = calculateMedian(sorted);
  return Math.round(overallMedian * 100) / 100;
}

/**
 * Computes sustainable swimming pace by filtering out aberrant laps via MAD
 * modified Z-scores and determining the continuous mode/median of inliers.
 *
 * @param {number[]} lapsSeconds - Array of lap times in seconds
 * @returns {{
 *   sustainablePace: number | null,
 *   inliers: number[],
 *   outliers: number[],
 *   outlierIndices: boolean[]
 * }}
 */
export function computeSustainablePace(lapsSeconds) {
  if (!Array.isArray(lapsSeconds) || lapsSeconds.length === 0) {
    return {
      sustainablePace: null,
      inliers: [],
      outliers: [],
      outlierIndices: [],
    };
  }

  const n = lapsSeconds.length;

  // Single lap: trivial degenerate case
  if (n === 1) {
    return {
      sustainablePace: lapsSeconds[0],
      inliers: [...lapsSeconds],
      outliers: [],
      outlierIndices: [false],
    };
  }

  // Two laps: sample size insufficient for dispersion filtering; bypass MAD
  if (n === 2) {
    const mean = Math.round(((lapsSeconds[0] + lapsSeconds[1]) / 2) * 100) / 100;
    return {
      sustainablePace: mean,
      inliers: [...lapsSeconds],
      outliers: [],
      outlierIndices: [false, false],
    };
  }

  // 5-number summary and IQR statistics
  const stats = computeBoxplotStats(lapsSeconds);

  // Check for zero variance (e.g. [45, 45, 45, 45])
  if (stats.min === stats.max) {
    return {
      sustainablePace: stats.min,
      inliers: [...lapsSeconds],
      outliers: [],
      outlierIndices: lapsSeconds.map(() => false),
    };
  }

  // Median and deviations
  const sorted = [...lapsSeconds].sort((a, b) => a - b);
  const median = calculateMedian(sorted);
  const deviations = lapsSeconds.map((x) => Math.abs(x - median));
  const sortedDeviations = [...deviations].sort((a, b) => a - b);
  const mad = calculateMedian(sortedDeviations);

  const hasIqrFence = n >= 4 && stats.iqr > 0;
  const MAD_THRESHOLD = 3.0;

  // Outlier detection for N >= 3
  const outlierIndices = lapsSeconds.map((x) => {
    let isOutlier = false;

    if (mad > 0) {
      const modZ = (0.6745 * Math.abs(x - median)) / mad;
      if (modZ > MAD_THRESHOLD) {
        isOutlier = true;
      }
    } else {
      // If MAD is 0 but variance > 0 (more than 50% values identical to median)
      const meanDev = deviations.reduce((sum, d) => sum + d, 0) / n;
      if (meanDev > 0) {
        const modZ = (0.6745 * Math.abs(x - median)) / (1.253314 * meanDev);
        if (modZ > MAD_THRESHOLD) {
          isOutlier = true;
        }
      }
    }

    // Complemented by Tukey IQR fence for N >= 4
    if (hasIqrFence) {
      if (x < stats.lowerFence || x > stats.upperFence) {
        isOutlier = true;
      }
    }

    return isOutlier;
  });

  const inliers = lapsSeconds.filter((_, idx) => !outlierIndices[idx]);
  const outliers = lapsSeconds.filter((_, idx) => outlierIndices[idx]);

  // Compute sustainable pace from inliers via modal clustering
  let sustainablePace = computeModalClusterPace(inliers);

  // Edge case safety fallback: if all were flagged as outliers
  if (sustainablePace === null && lapsSeconds.length > 0) {
    sustainablePace = Math.round(median * 100) / 100;
  }

  return {
    sustainablePace,
    inliers,
    outliers,
    outlierIndices,
  };
}
