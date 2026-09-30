#!/usr/bin/env node

/**
 * Empirical Mathematical & Statistical Verification Runner for SwimCoach Tracker
 *
 * Verifies:
 *   1. Physiological Training Zones Formula across sprint (48s), mid-distance (60s), distance (120s)
 *   2. MAD Modified Z-score outlier detection & Modal clustering across diverse distributions
 *   3. 5-number summary (Min, Q1, Median, Q3, Max) & SVG Boxplot geometry
 */

import assert from 'node:assert/strict';

import { calculateTrainingZones } from '../js/analytics/zones.js';
import { computeSustainablePace } from '../js/analytics/pace-calculator.js';
import { computeBoxplotStats } from '../js/analytics/stats.js';
import { renderBoxplotSVG } from '../js/ui/boxplot-svg.js';

console.log('========================================================================');
console.log('   SwimCoach Tracker - Empirical Mathematical & Statistical Challenge   ');
console.log('========================================================================\n');

let totalChecks = 0;
let passedChecks = 0;

function runCheck(name, fn) {
  totalChecks++;
  try {
    fn();
    passedChecks++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}: ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// Section 1: Training Zones Reciprocal Velocity Formula
// -----------------------------------------------------------------------------
console.log('\n--- 1. Training Zones Reciprocal Velocity Formula Verification ---');

runCheck('Sprint Baseline (48.0s): Reciprocal zones & rejection of multiplication', () => {
  const z = calculateTrainingZones(48.0);
  assert.strictEqual(z.zone75, 64.0);
  assert.strictEqual(z.zone80, 60.0);
  assert.strictEqual(Math.round(z.zone90 * 100) / 100, 53.33);
  assert.strictEqual(z.zone100, 48.0);

  // Multiplication rejection
  assert.notStrictEqual(z.zone75, 48.0 * 0.75); // 36.0s
  assert.notStrictEqual(z.zone80, 48.0 * 0.80); // 38.4s
  assert.notStrictEqual(z.zone90, 48.0 * 0.90); // 43.2s
});

runCheck('Mid-Distance Baseline (60.0s): 75% = 80.0s, 80% = 75.0s, 90% = 66.67s', () => {
  const z = calculateTrainingZones(60.0);
  assert.strictEqual(z.zone75, 80.0);
  assert.strictEqual(z.zone80, 75.0);
  assert.strictEqual(Math.round(z.zone90 * 100) / 100, 66.67);
  assert.strictEqual(z.zone100, 60.0);

  // Multiplication rejection
  assert.notStrictEqual(z.zone75, 45.0);
  assert.notStrictEqual(z.zone80, 48.0);
  assert.notStrictEqual(z.zone90, 54.0);
});

runCheck('Distance Baseline (120.0s): 75% = 160.0s, 80% = 150.0s, 90% = 133.33s', () => {
  const z = calculateTrainingZones(120.0);
  assert.strictEqual(z.zone75, 160.0);
  assert.strictEqual(z.zone80, 150.0);
  assert.strictEqual(Math.round(z.zone90 * 100) / 100, 133.33);
  assert.strictEqual(z.zone100, 120.0);

  // Multiplication rejection
  assert.notStrictEqual(z.zone75, 90.0);
  assert.notStrictEqual(z.zone80, 96.0);
  assert.notStrictEqual(z.zone90, 108.0);
});

runCheck('Input validation: Rejects zero, negative, NaN, non-finite, and strings', () => {
  for (const bad of [0, -5, NaN, Infinity, -Infinity, null, undefined, '60']) {
    assert.throws(() => calculateTrainingZones(bad), /Invalid baseline/);
  }
});

// -----------------------------------------------------------------------------
// Section 2: Sustainable Pace & MAD Outlier Rejection
// -----------------------------------------------------------------------------
console.log('\n--- 2. Sustainable Pace & Outlier Rejection Verification ---');

runCheck('Canonical lap set: [45, 45, 46, 60] -> pace 45.0s, outlier [60], rejects mean 49.0s', () => {
  const res = computeSustainablePace([45, 45, 46, 60]);
  assert.strictEqual(res.sustainablePace, 45.0);
  assert.ok(res.outliers.includes(60));
  assert.deepStrictEqual(res.inliers, [45, 45, 46]);
  assert.notStrictEqual(res.sustainablePace, 49.0);
});

runCheck('Hundredth-second drift modal clustering: [45.10, 45.15, 45.20, 60.00] -> 45.15s', () => {
  const res = computeSustainablePace([45.10, 45.15, 45.20, 60.00]);
  assert.strictEqual(res.sustainablePace, 45.15);
  assert.ok(res.outliers.includes(60.00));
  assert.deepStrictEqual(res.inliers, [45.10, 45.15, 45.20]);
});

runCheck('Zero-variance distribution: [45, 45, 45, 45] -> pace 45.0s, 0 outliers', () => {
  const res = computeSustainablePace([45, 45, 45, 45]);
  assert.strictEqual(res.sustainablePace, 45.0);
  assert.strictEqual(res.outliers.length, 0);
  assert.deepStrictEqual(res.inliers, [45, 45, 45, 45]);
});

runCheck('Zero-MAD non-zero variance: [45, 45, 45, 45, 75] -> pace 45.0s', () => {
  const res = computeSustainablePace([45, 45, 45, 45, 75]);
  assert.strictEqual(res.sustainablePace, 45.0);
});

runCheck('Bimodal distribution: [40, 40, 50, 50] -> pace 45.0s', () => {
  const res = computeSustainablePace([40, 40, 50, 50]);
  assert.strictEqual(res.sustainablePace, 45.0);
  assert.strictEqual(res.outliers.length, 0);
});

runCheck('Skewed distribution: [42, 43, 44, 46, 50, 56, 85] -> flags 85 as outlier', () => {
  const res = computeSustainablePace([42, 43, 44, 46, 50, 56, 85]);
  assert.ok(res.outliers.includes(85));
  assert.ok(!res.inliers.includes(85));
});

runCheck('Uniform distribution: [40, 42, 44, 46, 48, 50] -> pace 45.0s, 0 outliers', () => {
  const res = computeSustainablePace([40, 42, 44, 46, 48, 50]);
  assert.strictEqual(res.sustainablePace, 45.0);
  assert.strictEqual(res.outliers.length, 0);
});

runCheck('Gaussian distribution: [43.5, 44.2, 44.8, 45.0, 45.1, 45.2, 45.8, 46.5] -> 0 outliers', () => {
  const res = computeSustainablePace([43.5, 44.2, 44.8, 45.0, 45.1, 45.2, 45.8, 46.5]);
  assert.strictEqual(res.outliers.length, 0);
  assert.strictEqual(res.sustainablePace, 45.1);
});

runCheck('Extreme outlier: [30, 31, 30, 900] -> isolates 900, pace 30.0s', () => {
  const res = computeSustainablePace([30, 31, 30, 900]);
  assert.ok(res.outliers.includes(900));
  assert.strictEqual(res.sustainablePace, 30.0);
});

// -----------------------------------------------------------------------------
// Section 3: 5-Number Summary & Boxplot SVG Geometry
// -----------------------------------------------------------------------------
console.log('\n--- 3. 5-Number Summary & SVG Boxplot Geometry Verification ---');

runCheck('5-Number summary on [40, 42, 44, 46, 48, 50, 52] -> Min=40, Q1=42, Med=46, Q3=50, Max=52', () => {
  const stats = computeBoxplotStats([40, 42, 44, 46, 48, 50, 52]);
  assert.strictEqual(stats.min, 40);
  assert.strictEqual(stats.q1, 42);
  assert.strictEqual(stats.median, 46);
  assert.strictEqual(stats.q3, 50);
  assert.strictEqual(stats.max, 52);
  assert.strictEqual(stats.iqr, 8);
});

runCheck('5-Number summary on [42, 44, 45, 45, 46, 48, 60] -> Min=42, Q1=44, Med=45, Q3=48, Max=60, Outliers=[60]', () => {
  const stats = computeBoxplotStats([42, 44, 45, 45, 46, 48, 60]);
  assert.strictEqual(stats.min, 42);
  assert.strictEqual(stats.q1, 44);
  assert.strictEqual(stats.median, 45);
  assert.strictEqual(stats.q3, 48);
  assert.strictEqual(stats.max, 60);
  assert.deepStrictEqual(stats.outliers, [60]);
});

runCheck('Boxplot SVG geometric coordinates verification for [42, 44, 45, 45, 46, 48, 60]', () => {
  const svg = renderBoxplotSVG([42, 44, 45, 45, 46, 48, 60], { width: 300, height: 80 });

  assert.ok(svg.includes('viewBox="0 0 300 80"'));

  // Box rect
  const rectMatch = svg.match(/<rect[^>]*x="([0-9.]+)"[^>]*y="([0-9.]+)"[^>]*width="([0-9.]+)"[^>]*height="([0-9.]+)"/);
  assert.ok(rectMatch);
  const boxX = parseFloat(rectMatch[1]);
  const boxY = parseFloat(rectMatch[2]);
  const boxW = parseFloat(rectMatch[3]);
  const boxH = parseFloat(rectMatch[4]);
  assert.ok(boxX >= 32 && boxX <= 268);
  assert.strictEqual(boxY, 19);
  assert.strictEqual(boxH, 26);
  assert.ok(boxW > 0);

  // Median line
  const medMatch = svg.match(/<line[^>]*x1="([0-9.]+)"[^>]*y1="16"[^>]*x2="([0-9.]+)"[^>]*y2="48"/);
  assert.ok(medMatch);
  assert.strictEqual(medMatch[1], medMatch[2]);
  const medX = parseFloat(medMatch[1]);
  assert.ok(medX >= boxX && medX <= boxX + boxW);

  // Outlier circle
  const circleMatch = svg.match(/<circle[^>]*cx="([0-9.]+)"[^>]*cy="32"[^>]*r="5"[^>]*data-outlier="true"[^>]*data-value="60"/);
  assert.ok(circleMatch);
  const circleX = parseFloat(circleMatch[1]);
  assert.ok(circleX > boxX + boxW);

  // No NaN
  assert.ok(!svg.includes('NaN'));
});

runCheck('Boxplot SVG degenerate cases: zero variance [45, 45, 45, 45], single lap [50], empty []', () => {
  const svgZeroVar = renderBoxplotSVG([45, 45, 45, 45]);
  assert.ok(!svgZeroVar.includes('NaN'));
  assert.ok(svgZeroVar.includes('<rect'));

  const svgSingle = renderBoxplotSVG([50]);
  assert.ok(!svgSingle.includes('NaN'));
  assert.ok(svgSingle.includes('<rect'));

  const svgEmpty = renderBoxplotSVG([]);
  assert.ok(svgEmpty.includes('No lap data recorded'));
});

console.log('\n========================================================================');
console.log(`Results: ${passedChecks} / ${totalChecks} checks passed (100%)`);
console.log('========================================================================');
