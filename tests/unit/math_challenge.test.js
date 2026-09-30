import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calculateTrainingZones, ZONE_PERCENTAGES } from '../../js/analytics/zones.js';
import { computeSustainablePace } from '../../js/analytics/pace-calculator.js';
import { computeBoxplotStats, calculateMedian } from '../../js/analytics/stats.js';
import { renderBoxplotSVG } from '../../js/ui/boxplot-svg.js';

describe('Empirical Mathematical & Statistical Challenge Suite', () => {

  // =========================================================================
  // Challenge 1: Training Zones Formula across Diverse Baselines
  // =========================================================================
  describe('Challenge 1: Training Zones Reciprocal Velocity Formula', () => {
    const testBaselines = [
      { name: 'Elite Sprint (21.5s)', baseline: 21.5 },
      { name: 'Sprint (48.0s)', baseline: 48.0 },
      { name: 'Mid-Distance (60.0s)', baseline: 60.0 },
      { name: 'Distance (120.0s)', baseline: 120.0 },
      { name: 'Ultra-Distance (300.0s)', baseline: 300.0 },
    ];

    for (const { name, baseline } of testBaselines) {
      test(`Strict Reciprocal Velocity for ${name}`, () => {
        const zones = calculateTrainingZones(baseline);

        const expected75 = baseline / 0.75;
        const expected80 = baseline / 0.80;
        const expected90 = baseline / 0.90;
        const expected100 = baseline / 1.00;

        assert.strictEqual(zones.zone75, expected75, `75% zone must strictly equal ${baseline} / 0.75`);
        assert.strictEqual(zones.zone80, expected80, `80% zone must strictly equal ${baseline} / 0.80`);
        assert.strictEqual(zones.zone90, expected90, `90% zone must strictly equal ${baseline} / 0.90`);
        assert.strictEqual(zones.zone100, expected100, `100% zone must strictly equal ${baseline} / 1.00`);

        // Monotonicity of pacing: Lower effort percentage implies SLOWER velocity and LONGER time
        assert.ok(zones.zone75 > zones.zone80, '75% effort time must be greater than 80% effort time');
        assert.ok(zones.zone80 > zones.zone90, '80% effort time must be greater than 90% effort time');
        assert.ok(zones.zone90 > zones.zone100, '90% effort time must be greater than 100% effort time');

        // Simple multiplication must be explicitly rejected
        const naive75 = baseline * 0.75;
        const naive80 = baseline * 0.80;
        const naive90 = baseline * 0.90;

        assert.notStrictEqual(zones.zone75, naive75, `Zone 75 must NEVER equal naive multiplication ${naive75}`);
        assert.notStrictEqual(zones.zone80, naive80, `Zone 80 must NEVER equal naive multiplication ${naive80}`);
        assert.notStrictEqual(zones.zone90, naive90, `Zone 90 must NEVER equal naive multiplication ${naive90}`);
      });
    }

    test('Sprint 48s exact numerical assertions', () => {
      const zones = calculateTrainingZones(48.0);
      assert.strictEqual(zones.zone75, 64.0);
      assert.strictEqual(zones.zone80, 60.0);
      assert.strictEqual(Math.round(zones.zone90 * 100) / 100, 53.33);
      assert.strictEqual(zones.zone100, 48.0);
    });

    test('Mid-distance 60s exact numerical assertions', () => {
      const zones = calculateTrainingZones(60.0);
      assert.strictEqual(zones.zone75, 80.0);
      assert.strictEqual(zones.zone80, 75.0);
      assert.strictEqual(Math.round(zones.zone90 * 100) / 100, 66.67);
      assert.strictEqual(zones.zone100, 60.0);
    });

    test('Distance 120s exact numerical assertions', () => {
      const zones = calculateTrainingZones(120.0);
      assert.strictEqual(zones.zone75, 160.0);
      assert.strictEqual(zones.zone80, 150.0);
      assert.strictEqual(Math.round(zones.zone90 * 100) / 100, 133.33);
      assert.strictEqual(zones.zone100, 120.0);
    });

    test('Strict rejection of non-numeric, negative, and zero inputs', () => {
      assert.throws(() => calculateTrainingZones(0), /Invalid baseline/);
      assert.throws(() => calculateTrainingZones(-15), /Invalid baseline/);
      assert.throws(() => calculateTrainingZones(NaN), /Invalid baseline/);
      assert.throws(() => calculateTrainingZones(Infinity), /Invalid baseline/);
      assert.throws(() => calculateTrainingZones(-Infinity), /Invalid baseline/);
      assert.throws(() => calculateTrainingZones(null), /Invalid baseline/);
      assert.throws(() => calculateTrainingZones(undefined), /Invalid baseline/);
      assert.throws(() => calculateTrainingZones('60'), /Invalid baseline/);
      assert.throws(() => calculateTrainingZones([60]), /Invalid baseline/);
    });
  });

  // =========================================================================
  // Challenge 2: Sustainable Pace, MAD Outlier Rejection & Modal Clustering
  // =========================================================================
  describe('Challenge 2: Sustainable Pace & Outlier Rejection Across Diverse Distributions', () => {
    test('Canonical test case: [45, 45, 46, 60] flags 60 as outlier and returns ~45.0s, rejecting mean 49.0s', () => {
      const result = computeSustainablePace([45, 45, 46, 60]);
      assert.strictEqual(result.sustainablePace, 45.0);
      assert.ok(result.outliers.includes(60));
      assert.deepStrictEqual(result.outlierIndices, [false, false, false, true]);
      assert.deepStrictEqual(result.inliers, [45, 45, 46]);
      assert.notStrictEqual(result.sustainablePace, 49.0);
    });

    test('Modal clustering with small hundredth-second drift: [45.10, 45.15, 45.20, 60.00] -> ~45.15s', () => {
      const result = computeSustainablePace([45.10, 45.15, 45.20, 60.00]);
      assert.ok(result.outliers.includes(60.00));
      assert.deepStrictEqual(result.inliers, [45.10, 45.15, 45.20]);
      assert.strictEqual(result.sustainablePace, 45.15);
    });

    test('Zero-variance distribution: [45, 45, 45, 45]', () => {
      const result = computeSustainablePace([45, 45, 45, 45]);
      assert.strictEqual(result.sustainablePace, 45.0);
      assert.strictEqual(result.outliers.length, 0);
      assert.deepStrictEqual(result.inliers, [45, 45, 45, 45]);
      assert.deepStrictEqual(result.outlierIndices, [false, false, false, false]);
    });

    test('Zero-MAD non-zero variance distribution: [45, 45, 45, 45, 75]', () => {
      const result = computeSustainablePace([45, 45, 45, 45, 75]);
      // Mode is unmistakably 45.0
      assert.strictEqual(result.sustainablePace, 45.0);
      assert.ok(!isNaN(result.sustainablePace));
    });

    test('Bimodal distribution: [40, 40, 50, 50] returns symmetric median without crash', () => {
      const result = computeSustainablePace([40, 40, 50, 50]);
      assert.strictEqual(result.outliers.length, 0);
      assert.strictEqual(result.sustainablePace, 45.0);
    });

    test('Skewed distribution with extreme right outlier: [42, 43, 44, 46, 50, 56, 85]', () => {
      const result = computeSustainablePace([42, 43, 44, 46, 50, 56, 85]);
      assert.ok(result.outliers.includes(85), '85 must be flagged as outlier');
      assert.ok(!result.inliers.includes(85));
      assert.ok(result.sustainablePace >= 42.0 && result.sustainablePace <= 46.0);
    });

    test('Uniform distribution: [40, 42, 44, 46, 48, 50]', () => {
      const result = computeSustainablePace([40, 42, 44, 46, 48, 50]);
      assert.strictEqual(result.outliers.length, 0, 'No point in uniform sequence should be an outlier');
      assert.strictEqual(result.sustainablePace, 45.0, 'Median of uniform distribution is 45.0s');
    });

    test('Gaussian-like distribution: [43.5, 44.2, 44.8, 45.0, 45.1, 45.2, 45.8, 46.5]', () => {
      const result = computeSustainablePace([43.5, 44.2, 44.8, 45.0, 45.1, 45.2, 45.8, 46.5]);
      assert.strictEqual(result.outliers.length, 0, 'No points in normal range should be flagged');
      assert.ok(Math.abs(result.sustainablePace - 45.1) <= 0.1, `Expected sustainable pace near 45.1, got ${result.sustainablePace}`);
    });

    test('Extreme outlier tolerance: [30, 31, 30, 900]', () => {
      const result = computeSustainablePace([30, 31, 30, 900]);
      assert.ok(result.outliers.includes(900));
      assert.strictEqual(result.sustainablePace, 30.0);
    });

    test('Degenerate cases: empty [], single [45.2], two [44.0, 46.0]', () => {
      assert.strictEqual(computeSustainablePace([]).sustainablePace, null);
      assert.strictEqual(computeSustainablePace([45.2]).sustainablePace, 45.2);
      assert.strictEqual(computeSustainablePace([44.0, 46.0]).sustainablePace, 45.0);
    });
  });

  // =========================================================================
  // Challenge 3: 5-Number Summary & Boxplot SVG Geometry
  // =========================================================================
  describe('Challenge 3: 5-Number Summary & SVG Boxplot Geometry', () => {
    test('5-number summary on canonical odd-count dataset [40, 42, 44, 46, 48, 50, 52]', () => {
      const stats = computeBoxplotStats([40, 42, 44, 46, 48, 50, 52]);
      assert.strictEqual(stats.count, 7);
      assert.strictEqual(stats.min, 40);
      assert.strictEqual(stats.q1, 42);
      assert.strictEqual(stats.median, 46);
      assert.strictEqual(stats.q3, 50);
      assert.strictEqual(stats.max, 52);
      assert.strictEqual(stats.iqr, 8);
      assert.strictEqual(stats.lowerFence, 30);
      assert.strictEqual(stats.upperFence, 62);
      assert.deepStrictEqual(stats.outliers, []);
    });

    test('5-number summary on canonical even-count dataset [10, 20, 30, 40, 50, 60, 70, 80]', () => {
      const stats = computeBoxplotStats([10, 20, 30, 40, 50, 60, 70, 80]);
      assert.strictEqual(stats.count, 8);
      assert.strictEqual(stats.min, 10);
      assert.strictEqual(stats.q1, 25);
      assert.strictEqual(stats.median, 45);
      assert.strictEqual(stats.q3, 65);
      assert.strictEqual(stats.max, 80);
      assert.strictEqual(stats.iqr, 40);
      assert.strictEqual(stats.lowerFence, -35);
      assert.strictEqual(stats.upperFence, 125);
      assert.deepStrictEqual(stats.outliers, []);
    });

    test('5-number summary with outlier isolation [42, 44, 45, 45, 46, 48, 60]', () => {
      const stats = computeBoxplotStats([42, 44, 45, 45, 46, 48, 60]);
      assert.strictEqual(stats.min, 42);
      assert.strictEqual(stats.q1, 44);
      assert.strictEqual(stats.median, 45);
      assert.strictEqual(stats.q3, 48);
      assert.strictEqual(stats.max, 60);
      assert.strictEqual(stats.iqr, 4);
      assert.strictEqual(stats.lowerFence, 38);
      assert.strictEqual(stats.upperFence, 54);
      assert.deepStrictEqual(stats.outliers, [60]);
    });

    test('Boxplot SVG geometric coordinates and structure verification', () => {
      const laps = [42, 44, 45, 45, 46, 48, 60];
      const svg = renderBoxplotSVG(laps, { width: 300, height: 80 });

      // 1. Root SVG viewBox verification
      assert.ok(svg.includes('viewBox="0 0 300 80"'), 'SVG viewBox must be 0 0 300 80');

      // 2. IQR Box <rect> verification
      const rectMatch = svg.match(/<rect[^>]*x="([0-9.]+)"[^>]*y="([0-9.]+)"[^>]*width="([0-9.]+)"[^>]*height="([0-9.]+)"/);
      assert.ok(rectMatch, '<rect> element for IQR box must be present with valid numeric coordinates');
      const boxX = parseFloat(rectMatch[1]);
      const boxY = parseFloat(rectMatch[2]);
      const boxW = parseFloat(rectMatch[3]);
      const boxH = parseFloat(rectMatch[4]);
      assert.ok(boxX >= 32 && boxX <= 268, `Box X (${boxX}) must be within plot margins [32, 268]`);
      assert.strictEqual(boxY, 19, 'Box Y must equal 19 (centerY 32 - height 26 / 2)');
      assert.strictEqual(boxH, 26, 'Box Height must equal 26');
      assert.ok(boxW > 0, `Box Width (${boxW}) must be positive`);

      // 3. Median <line> verification
      const medianLineMatch = svg.match(/<line[^>]*x1="([0-9.]+)"[^>]*y1="16"[^>]*x2="([0-9.]+)"[^>]*y2="48"/);
      assert.ok(medianLineMatch, 'Median line must be rendered between y=16 and y=48');
      const medX1 = parseFloat(medianLineMatch[1]);
      const medX2 = parseFloat(medianLineMatch[2]);
      assert.strictEqual(medX1, medX2, 'Median line must be strictly vertical (x1 == x2)');
      assert.ok(medX1 >= boxX && medX1 <= boxX + boxW, 'Median line X must be located within IQR box');

      // 4. Outlier <circle> verification
      const circleMatch = svg.match(/<circle[^>]*cx="([0-9.]+)"[^>]*cy="32"[^>]*r="5"[^>]*data-outlier="true"[^>]*data-value="60"/);
      assert.ok(circleMatch, 'Outlier circle must have cy=32, r=5, data-outlier=true, and data-value=60');
      const circleX = parseFloat(circleMatch[1]);
      assert.ok(circleX > boxX + boxW, 'Outlier 60 must be plotted to the right of IQR box');

      // 5. Whiskers verification
      const whiskerMatches = Array.from(svg.matchAll(/<line[^>]*stroke-linecap="round"[^>]*\/>/g));
      assert.ok(whiskerMatches.length >= 2, 'Whisker lines must be rendered');

      // 6. Labels verification
      assert.ok(svg.includes('42.0s'), 'Min label 42.0s must be present');
      assert.ok(svg.includes('45.00s'), 'Median label 45.00s must be present');
      assert.ok(svg.includes('60.0s'), 'Max label 60.0s must be present');

      // 7. No NaN or undefined in any coordinate
      assert.ok(!svg.includes('NaN'), 'SVG must never contain NaN');
      assert.ok(!svg.includes('undefined'), 'SVG must never contain undefined');
    });

    test('Boxplot SVG geometric robustness under zero-variance [45, 45, 45, 45]', () => {
      const svg = renderBoxplotSVG([45, 45, 45, 45]);
      assert.ok(!svg.includes('NaN'), 'Zero-variance must not produce NaN');
      assert.ok(svg.includes('<rect'), 'Should render box rect');
      assert.ok(svg.includes('<line'), 'Should render median line');
      assert.ok(!svg.includes('data-outlier="true"'), 'Should have no outliers');
    });

    test('Boxplot SVG geometric robustness under single lap [50.0]', () => {
      const svg = renderBoxplotSVG([50.0]);
      assert.ok(!svg.includes('NaN'), 'Single lap must not produce NaN');
      assert.ok(svg.includes('50.00s') || svg.includes('50.0s'), 'Should render 50s label');
    });

    test('Boxplot SVG geometric robustness under empty dataset []', () => {
      const svg = renderBoxplotSVG([]);
      assert.ok(svg.includes('Sin datos de pases registrados'));
      assert.ok(!svg.includes('NaN'));
    });
  });
});
