import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Dynamic imports for progressive testability (Milestone 3 dependencies)
let zonesModule = null;
let paceModule = null;
let statsModule = null;

try {
  zonesModule = await import('../../js/analytics/zones.js');
} catch (e) {}

try {
  paceModule = await import('../../js/analytics/pace-calculator.js');
} catch (e) {}

try {
  statsModule = await import('../../js/analytics/stats.js');
} catch (e) {}

describe('Analytics Engine Unit Tests', () => {

  // ==========================================
  // Group 1: Training Zones Calculation (AC 3)
  // ==========================================
  describe('Training Zones (zones.js)', () => {
    function getZonesHelper(t) {
      if (!zonesModule) {
        t.skip('Pending Milestone 3 implementation (js/analytics/zones.js)');
        return null;
      }
      return zonesModule;
    }

    test('TC-T1-301: 60s baseline computes 75% zone as exactly 80.00s (reciprocal velocity)', (t) => {
      const mod = getZonesHelper(t);
      if (!mod) return;

      const zones = mod.calculateTrainingZones(60.0);
      assert.strictEqual(zones.zone75, 80.0, '60s / 0.75 must equal 80.0s');
    });

    test('TC-T1-302: 60s baseline computes 80% and 90% zones accurately', (t) => {
      const mod = getZonesHelper(t);
      if (!mod) return;

      const zones = mod.calculateTrainingZones(60.0);
      assert.strictEqual(zones.zone80, 75.0, '60s / 0.80 must equal 75.0s');

      const rounded90 = Math.round(zones.zone90 * 100) / 100;
      assert.strictEqual(rounded90, 66.67, '60s / 0.90 must be ~66.67s');

      assert.strictEqual(zones.zone100, 60.0, '60s / 1.00 must equal 60.0s');
    });

    test('TC-AC-3: Anti-Regression - strictly rejects simple multiplication formula', (t) => {
      const mod = getZonesHelper(t);
      if (!mod) return;

      const zones = mod.calculateTrainingZones(60.0);
      // Physiological velocity formula: T = Base / (Pct / 100)
      // Must NOT be Base * (Pct / 100) = 45s, 48s, 54s
      assert.notStrictEqual(zones.zone75, 45.0, 'Zone 75% must NEVER be calculated as 60 * 0.75 = 45s');
      assert.notStrictEqual(zones.zone80, 48.0, 'Zone 80% must NEVER be calculated as 60 * 0.80 = 48s');
      assert.notStrictEqual(zones.zone90, 54.0, 'Zone 90% must NEVER be calculated as 60 * 0.90 = 54s');
    });

    test('TC-T1-303: Sprint baseline (48.0s) and Distance baseline (90.0s)', (t) => {
      const mod = getZonesHelper(t);
      if (!mod) return;

      const sprintZones = mod.calculateTrainingZones(48.0);
      assert.strictEqual(sprintZones.zone75, 64.0, '48s / 0.75 = 64.0s');
      assert.strictEqual(sprintZones.zone80, 60.0, '48s / 0.80 = 60.0s');
      assert.strictEqual(Math.round(sprintZones.zone90 * 100) / 100, 53.33);

      const distZones = mod.calculateTrainingZones(90.0);
      assert.strictEqual(distZones.zone75, 120.0, '90s / 0.75 = 120.0s');
      assert.strictEqual(distZones.zone80, 112.5, '90s / 0.80 = 112.5s');
      assert.strictEqual(distZones.zone90, 100.0, '90s / 0.90 = 100.0s');
    });

    test('TC-T2-301: calculateTrainingZones rejects invalid inputs (zero, negative, NaN)', (t) => {
      const mod = getZonesHelper(t);
      if (!mod) return;

      assert.throws(() => mod.calculateTrainingZones(0), /Invalid baseline/);
      assert.throws(() => mod.calculateTrainingZones(-10), /Invalid baseline/);
      assert.throws(() => mod.calculateTrainingZones(NaN), /Invalid baseline/);
      assert.throws(() => mod.calculateTrainingZones(null), /Invalid baseline/);
      assert.throws(() => mod.calculateTrainingZones('abc'), /Invalid baseline/);
    });
  });

  // ==========================================
  // Group 2: Sustainable Pace & MAD Outliers (AC 4)
  // ==========================================
  describe('Sustainable Pace & Outliers (pace-calculator.js)', () => {
    function getPaceHelper(t) {
      if (!paceModule) {
        t.skip('Pending Milestone 3 implementation (js/analytics/pace-calculator.js)');
        return null;
      }
      return paceModule;
    }

    test('TC-AC-4: [45, 45, 46, 60] flags 60 as outlier and returns modal pace ~45.0s, rejecting mean 49.0s', (t) => {
      const mod = getPaceHelper(t);
      if (!mod) return;

      const laps = [45, 45, 46, 60];
      const result = mod.computeSustainablePace(laps);

      // Sustainable pace should identify ~45.0s (modal / inlier pace)
      assert.ok(
        result.sustainablePace >= 45.0 && result.sustainablePace <= 45.5,
        `Expected sustainable pace in [45.0, 45.5], got ${result.sustainablePace}`
      );

      // Must strictly NOT equal simple arithmetic mean 49.0s
      assert.notStrictEqual(result.sustainablePace, 49.0, 'Sustainable pace must NOT equal arithmetic mean 49.0s');

      // Outlier identification
      assert.ok(result.outliers.includes(60), '60 must be identified as an outlier');
      assert.deepStrictEqual(result.outlierIndices, [false, false, false, true], 'outlierIndices must flag index 3 only');
      assert.deepStrictEqual(result.inliers, [45, 45, 46], 'inliers must contain [45, 45, 46]');
    });

    test('TC-T2-302: Zero variance [45, 45, 45, 45] flags 0 outliers and returns 45.0s', (t) => {
      const mod = getPaceHelper(t);
      if (!mod) return;

      const result = mod.computeSustainablePace([45, 45, 45, 45]);
      assert.strictEqual(result.sustainablePace, 45.0);
      assert.strictEqual(result.outliers.length, 0);
      assert.deepStrictEqual(result.inliers, [45, 45, 45, 45]);
    });

    test('TC-T2-303: Extreme outlier [30, 31, 30, 900] isolates 900 and returns ~30s', (t) => {
      const mod = getPaceHelper(t);
      if (!mod) return;

      const result = mod.computeSustainablePace([30, 31, 30, 900]);
      assert.ok(result.sustainablePace >= 30.0 && result.sustainablePace <= 31.0);
      assert.ok(result.outliers.includes(900));
    });

    test('TC-T2-304: Bimodal laps [40, 40, 50, 50] returns stable pace without error', (t) => {
      const mod = getPaceHelper(t);
      if (!mod) return;

      const result = mod.computeSustainablePace([40, 40, 50, 50]);
      assert.ok(typeof result.sustainablePace === 'number' && !isNaN(result.sustainablePace));
      assert.ok(result.sustainablePace >= 40.0 && result.sustainablePace <= 50.0);
    });

    test('TC-T2-305: Small N=2 [44.0, 46.0] bypasses MAD filter and returns median/mean 45.0s', (t) => {
      const mod = getPaceHelper(t);
      if (!mod) return;

      const result = mod.computeSustainablePace([44.0, 46.0]);
      assert.strictEqual(result.sustainablePace, 45.0);
      assert.strictEqual(result.outliers.length, 0);
    });

    test('TC-T2-201: Degenerate cases: empty array [] and single lap [45.2]', (t) => {
      const mod = getPaceHelper(t);
      if (!mod) return;

      const emptyRes = mod.computeSustainablePace([]);
      assert.strictEqual(emptyRes.sustainablePace, null);
      assert.deepStrictEqual(emptyRes.inliers, []);
      assert.deepStrictEqual(emptyRes.outliers, []);

      const singleRes = mod.computeSustainablePace([45.2]);
      assert.strictEqual(singleRes.sustainablePace, 45.2);
      assert.deepStrictEqual(singleRes.inliers, [45.2]);
      assert.deepStrictEqual(singleRes.outliers, []);
    });

    test('TC-T2-306: Continuous stopwatch values with minor drift [45.12, 45.20, 45.15, 62.00]', (t) => {
      const mod = getPaceHelper(t);
      if (!mod) return;

      const result = mod.computeSustainablePace([45.12, 45.20, 45.15, 62.00]);
      assert.ok(result.sustainablePace >= 45.1 && result.sustainablePace <= 45.25);
      assert.ok(result.outliers.includes(62.00));
    });
  });

  // ==========================================
  // Group 3: 5-Number Summary Statistics (AC 5)
  // ==========================================
  describe('5-Number Summary & Boxplot Stats (stats.js)', () => {
    function getStatsHelper(t) {
      if (!statsModule) {
        t.skip('Pending Milestone 3 implementation (js/analytics/stats.js)');
        return null;
      }
      return statsModule;
    }

    test('TC-T1-306: Standard dataset [40, 42, 44, 46, 48, 50, 52] computes exact quartiles', (t) => {
      const mod = getStatsHelper(t);
      if (!mod) return;

      const stats = mod.computeBoxplotStats([40, 42, 44, 46, 48, 50, 52]);
      assert.strictEqual(stats.count, 7);
      assert.strictEqual(stats.min, 40);
      assert.strictEqual(stats.q1, 42);
      assert.strictEqual(stats.median, 46);
      assert.strictEqual(stats.q3, 50);
      assert.strictEqual(stats.max, 52);
      assert.strictEqual(stats.iqr, 8);
      assert.deepStrictEqual(stats.outliers, []);
    });

    test('TC-AC-5: Dataset [42, 44, 45, 45, 46, 48, 60] computes summary and identifies 60 as outlier', (t) => {
      const mod = getStatsHelper(t);
      if (!mod) return;

      const stats = mod.computeBoxplotStats([42, 44, 45, 45, 46, 48, 60]);
      assert.strictEqual(stats.min, 42);
      assert.strictEqual(stats.median, 45);
      assert.strictEqual(stats.q1, 44);
      // Q3 can be 48 or 47 depending on quartile method
      assert.ok(stats.q3 >= 47 && stats.q3 <= 48, `Q3 should be 47 or 48, got ${stats.q3}`);
      assert.strictEqual(stats.max, 60);

      // Fences: Upper fence = Q3 + 1.5 * IQR
      assert.ok(stats.upperFence < 60, `Upper fence must isolate 60, upperFence=${stats.upperFence}`);
      assert.ok(stats.outliers.includes(60), 'Outliers array must include 60');
    });

    test('TC-T2-307: Single lap [50] collapses whiskers and box gracefully', (t) => {
      const mod = getStatsHelper(t);
      if (!mod) return;

      const stats = mod.computeBoxplotStats([50]);
      assert.strictEqual(stats.count, 1);
      assert.strictEqual(stats.min, 50);
      assert.strictEqual(stats.q1, 50);
      assert.strictEqual(stats.median, 50);
      assert.strictEqual(stats.q3, 50);
      assert.strictEqual(stats.max, 50);
      assert.strictEqual(stats.iqr, 0);
      assert.deepStrictEqual(stats.outliers, []);
    });

    test('TC-T2-308: Identical laps [45, 45, 45, 45] collapses box to single value with zero IQR', (t) => {
      const mod = getStatsHelper(t);
      if (!mod) return;

      const stats = mod.computeBoxplotStats([45, 45, 45, 45]);
      assert.strictEqual(stats.min, 45);
      assert.strictEqual(stats.q1, 45);
      assert.strictEqual(stats.median, 45);
      assert.strictEqual(stats.q3, 45);
      assert.strictEqual(stats.max, 45);
      assert.strictEqual(stats.iqr, 0);
      assert.deepStrictEqual(stats.outliers, []);
    });

    test('TC-T2-309: Empty dataset [] handled gracefully without crash', (t) => {
      const mod = getStatsHelper(t);
      if (!mod) return;

      const stats = mod.computeBoxplotStats([]);
      assert.strictEqual(stats.count, 0);
      assert.deepStrictEqual(stats.outliers, []);
    });
  });
});
