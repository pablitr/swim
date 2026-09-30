import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import { SwimmerRepository } from '../../js/storage/repository.js';
import { closeDB } from '../../js/storage/db.js';

describe('Storage Engine & SwimmerRepository Tests', () => {
  let repo;

  beforeEach(async () => {
    repo = new SwimmerRepository();
    await repo.init();
    await repo.clearAll();
  });

  afterEach(async () => {
    await repo.clearAll();
    closeDB();
  });

  // ==========================================
  // Group 1: Swimmer Profile CRUD
  // ==========================================
  describe('Swimmer CRUD Operations', () => {
    test('TC-T1-401: saveSwimmer and getSwimmer retrieves exact swimmer profile', async () => {
      const swimmer = {
        id: 'swim-001',
        name: 'Michael Phelps',
        lane: 1,
        baseline100mSeconds: 60.0,
        createdAt: 1727700000000
      };

      await repo.saveSwimmer(swimmer);
      const retrieved = await repo.getSwimmer('swim-001');

      assert.ok(retrieved, 'Swimmer should be found in storage');
      assert.strictEqual(retrieved.id, 'swim-001');
      assert.strictEqual(retrieved.name, 'Michael Phelps');
      assert.strictEqual(retrieved.lane, 1);
      assert.strictEqual(retrieved.baseline100mSeconds, 60.0);
      assert.strictEqual(retrieved.createdAt, 1727700000000);
    });

    test('TC-T1-501: getSwimmers returns all registered swimmers', async () => {
      await repo.saveSwimmer({ id: 's1', name: 'Katie Ledecky', lane: 2, baseline100mSeconds: 58.5 });
      await repo.saveSwimmer({ id: 's2', name: 'Caeleb Dressel', lane: 3, baseline100mSeconds: 47.0 });

      const all = await repo.getSwimmers();
      assert.strictEqual(all.length, 2, 'Should return exactly 2 swimmers');

      const names = all.map(s => s.name);
      assert.ok(names.includes('Katie Ledecky'));
      assert.ok(names.includes('Caeleb Dressel'));
    });

    test('TC-T1-503: saveSwimmer updates existing swimmer profile without duplicating', async () => {
      const swimmer = { id: 's1', name: 'Summer McIntosh', lane: 4, baseline100mSeconds: 57.0 };
      await repo.saveSwimmer(swimmer);

      // Update baseline and lane
      const updated = { ...swimmer, lane: 5, baseline100mSeconds: 55.8 };
      await repo.saveSwimmer(updated);

      const all = await repo.getSwimmers();
      assert.strictEqual(all.length, 1, 'Should still contain 1 swimmer record');

      const retrieved = await repo.getSwimmer('s1');
      assert.strictEqual(retrieved.lane, 5);
      assert.strictEqual(retrieved.baseline100mSeconds, 55.8);
    });

    test('TC-T2-501: saveSwimmer auto-generates unique ID if missing', async () => {
      const swimmerWithoutId = { name: 'Leon Marchand', lane: 6, baseline100mSeconds: 52.3 };
      await repo.saveSwimmer(swimmerWithoutId);

      const all = await repo.getSwimmers();
      assert.strictEqual(all.length, 1);
      assert.ok(all[0].id, 'Swimmer must have an auto-generated id');
      assert.ok(all[0].id.startsWith('swimmer-'), 'Generated id should follow naming convention');
    });

    test('TC-T1-505: deleteSwimmer removes swimmer from database', async () => {
      await repo.saveSwimmer({ id: 's-del', name: 'To Be Deleted', lane: 8, baseline100mSeconds: 65.0 });
      let item = await repo.getSwimmer('s-del');
      assert.ok(item);

      await repo.deleteSwimmer('s-del');
      item = await repo.getSwimmer('s-del');
      assert.strictEqual(item, null, 'Deleted swimmer should return null');
    });

    test('TC-T2-502: deleteSwimmer cascades deletion to timer state and associated laps', async () => {
      const swimmerId = 's-cascade';
      await repo.saveSwimmer({ id: swimmerId, name: 'Cascade Test', lane: 1, baseline100mSeconds: 60.0 });
      await repo.saveTimerState({ swimmerId, state: 'RUNNING', accumulatedMs: 12000 });
      await repo.saveLap({ id: 'lap-c1', swimmerId, lapNumber: 1, splitDurationMs: 6000, cumulativeDurationMs: 6000 });
      await repo.saveLap({ id: 'lap-c2', swimmerId, lapNumber: 2, splitDurationMs: 6000, cumulativeDurationMs: 12000 });

      // Verify records exist before cascade
      assert.ok(await repo.getTimerState(swimmerId));
      assert.strictEqual((await repo.getLaps(swimmerId)).length, 2);

      // Delete swimmer
      await repo.deleteSwimmer(swimmerId);

      // Verify cascade
      assert.strictEqual(await repo.getSwimmer(swimmerId), null);
      assert.strictEqual(await repo.getTimerState(swimmerId), null, 'Timer state must be deleted');
      assert.strictEqual((await repo.getLaps(swimmerId)).length, 0, 'Associated laps must be cleared');
    });

    test('TC-T2-503: saveSwimmer rejects invalid input arguments', async () => {
      await assert.rejects(async () => {
        await repo.saveSwimmer(null);
      }, /Invalid swimmer object/);

      await assert.rejects(async () => {
        await repo.saveSwimmer('not an object');
      }, /Invalid swimmer object/);
    });

    test('TC-T2-504: getSwimmer returns null for empty or non-existent ID', async () => {
      assert.strictEqual(await repo.getSwimmer(''), null);
      assert.strictEqual(await repo.getSwimmer(null), null);
      assert.strictEqual(await repo.getSwimmer('non-existent-id'), null);
    });
  });

  // ==========================================
  // Group 2: Timer State Persistence & Reload Recovery
  // ==========================================
  describe('Timer State Persistence', () => {
    test('TC-T1-402: saveTimerState commits atomic timer state to IndexedDB', async () => {
      const timerState = {
        swimmerId: 'swim-timer-1',
        sessionId: 'session-default',
        state: 'RUNNING',
        startTime: 1727701000000,
        lastResumeTime: 1727701005000,
        accumulatedMs: 5000,
        currentLapIndex: 2,
        lastLapCumulativeMs: 5000,
        updatedAt: 1727701005000
      };

      await repo.saveTimerState(timerState);
      const retrieved = await repo.getTimerState('swim-timer-1');

      assert.ok(retrieved, 'Timer state should be retrieved');
      assert.strictEqual(retrieved.swimmerId, 'swim-timer-1');
      assert.strictEqual(retrieved.state, 'RUNNING');
      assert.strictEqual(retrieved.accumulatedMs, 5000);
      assert.strictEqual(retrieved.lastResumeTime, 1727701005000);
      assert.strictEqual(retrieved.currentLapIndex, 2);
    });

    test('TC-T1-404: getAllTimerStates returns all active swimmer states for batch reload', async () => {
      await repo.saveTimerState({ swimmerId: 's1', state: 'RUNNING', accumulatedMs: 10000 });
      await repo.saveTimerState({ swimmerId: 's2', state: 'PAUSED', accumulatedMs: 20000 });
      await repo.saveTimerState({ swimmerId: 's3', state: 'STOPPED', accumulatedMs: 30000 });

      const allStates = await repo.getAllTimerStates();
      assert.strictEqual(allStates.length, 3, 'Should return all 3 timer states');

      const stateMap = Object.fromEntries(allStates.map(s => [s.swimmerId, s.state]));
      assert.strictEqual(stateMap.s1, 'RUNNING');
      assert.strictEqual(stateMap.s2, 'PAUSED');
      assert.strictEqual(stateMap.s3, 'STOPPED');
    });

    test('TC-T2-402: State transitions persist accumulatedMs accurately across PAUSED state', async () => {
      const swimmerId = 'swim-paused-test';
      // Step 1: Running
      await repo.saveTimerState({
        swimmerId,
        state: 'RUNNING',
        startTime: 1000,
        lastResumeTime: 1000,
        accumulatedMs: 0
      });

      // Step 2: Paused after 4200ms
      await repo.saveTimerState({
        swimmerId,
        state: 'PAUSED',
        startTime: 1000,
        lastResumeTime: null,
        accumulatedMs: 4200
      });

      const pausedState = await repo.getTimerState(swimmerId);
      assert.strictEqual(pausedState.state, 'PAUSED');
      assert.strictEqual(pausedState.accumulatedMs, 4200);
      assert.strictEqual(pausedState.lastResumeTime, null);
    });

    test('TC-T2-403: saveTimerState rejects state without swimmerId', async () => {
      await assert.rejects(async () => {
        await repo.saveTimerState({ state: 'RUNNING', accumulatedMs: 100 });
      }, /Timer state missing swimmerId/);
    });
  });

  // ==========================================
  // Group 3: Lap Recording & Persistence
  // ==========================================
  describe('Lap Persistence Operations', () => {
    test('TC-T1-403: saveLap records lap and getLaps retrieves chronologically', async () => {
      const swimmerId = 'swim-lap-1';

      await repo.saveLap({
        swimmerId,
        lapNumber: 1,
        splitDurationMs: 15200,
        cumulativeDurationMs: 15200,
        timestamp: 1727702000000
      });

      await repo.saveLap({
        swimmerId,
        lapNumber: 2,
        splitDurationMs: 16100,
        cumulativeDurationMs: 31300,
        timestamp: 1727702016000
      });

      await repo.saveLap({
        swimmerId,
        lapNumber: 3,
        splitDurationMs: 15800,
        cumulativeDurationMs: 47100,
        timestamp: 1727702032000
      });

      const laps = await repo.getLaps(swimmerId);
      assert.strictEqual(laps.length, 3, 'Must return all 3 laps');

      // Chronological ordering
      assert.strictEqual(laps[0].lapNumber, 1);
      assert.strictEqual(laps[0].splitDurationMs, 15200);
      assert.strictEqual(laps[0].cumulativeDurationMs, 15200);

      assert.strictEqual(laps[1].lapNumber, 2);
      assert.strictEqual(laps[1].splitDurationMs, 16100);
      assert.strictEqual(laps[1].cumulativeDurationMs, 31300);

      assert.strictEqual(laps[2].lapNumber, 3);
      assert.strictEqual(laps[2].splitDurationMs, 15800);
      assert.strictEqual(laps[2].cumulativeDurationMs, 47100);
    });

    test('TC-ADV-REPO-01: getLaps preserves chronological timestamp order across multiple heats with reset lapNumbers', async () => {
      const swimmerId = 'swim-multi-heat';

      // Heat 1: laps 1 and 2
      await repo.saveLap({
        swimmerId,
        lapNumber: 1,
        splitDurationMs: 30000,
        cumulativeDurationMs: 30000,
        timestamp: 1000
      });
      await repo.saveLap({
        swimmerId,
        lapNumber: 2,
        splitDurationMs: 31000,
        cumulativeDurationMs: 61000,
        timestamp: 2000
      });

      // Heat 2 (timer restarted without clearing laps): lapNumber resets to 1 and 2, but timestamps are later
      await repo.saveLap({
        swimmerId,
        lapNumber: 1,
        splitDurationMs: 29000,
        cumulativeDurationMs: 29000,
        timestamp: 5000
      });
      await repo.saveLap({
        swimmerId,
        lapNumber: 2,
        splitDurationMs: 29500,
        cumulativeDurationMs: 58500,
        timestamp: 6000
      });

      const laps = await repo.getLaps(swimmerId);
      assert.strictEqual(laps.length, 4, 'Must return all 4 laps');
      assert.strictEqual(laps[0].timestamp, 1000, 'Heat 1 Lap 1 must be first');
      assert.strictEqual(laps[1].timestamp, 2000, 'Heat 1 Lap 2 must be second');
      assert.strictEqual(laps[2].timestamp, 5000, 'Heat 2 Lap 1 must be third');
      assert.strictEqual(laps[3].timestamp, 6000, 'Heat 2 Lap 2 must be fourth');
    });

    test('TC-T1-201: getLaps isolates data between multiple concurrent swimmers', async () => {
      // Swimmer A records 2 laps
      await repo.saveLap({ swimmerId: 'swim-A', lapNumber: 1, splitDurationMs: 20000, cumulativeDurationMs: 20000 });
      await repo.saveLap({ swimmerId: 'swim-A', lapNumber: 2, splitDurationMs: 21000, cumulativeDurationMs: 41000 });

      // Swimmer B records 3 laps
      await repo.saveLap({ swimmerId: 'swim-B', lapNumber: 1, splitDurationMs: 18000, cumulativeDurationMs: 18000 });
      await repo.saveLap({ swimmerId: 'swim-B', lapNumber: 2, splitDurationMs: 18500, cumulativeDurationMs: 36500 });
      await repo.saveLap({ swimmerId: 'swim-B', lapNumber: 3, splitDurationMs: 19000, cumulativeDurationMs: 55500 });

      const lapsA = await repo.getLaps('swim-A');
      const lapsB = await repo.getLaps('swim-B');

      assert.strictEqual(lapsA.length, 2, 'Swimmer A must have exactly 2 laps');
      assert.strictEqual(lapsB.length, 3, 'Swimmer B must have exactly 3 laps');

      // Verify no cross-contamination
      assert.ok(lapsA.every(l => l.swimmerId === 'swim-A'));
      assert.ok(lapsB.every(l => l.swimmerId === 'swim-B'));
    });

    test('TC-T2-201: getLaps returns empty array for swimmer with no recorded laps', async () => {
      const laps = await repo.getLaps('swimmer-no-laps');
      assert.deepStrictEqual(laps, []);
    });

    test('TC-T1-105: clearLaps removes laps for specified swimmer only', async () => {
      await repo.saveLap({ swimmerId: 'swim-X', lapNumber: 1, splitDurationMs: 10000, cumulativeDurationMs: 10000 });
      await repo.saveLap({ swimmerId: 'swim-Y', lapNumber: 1, splitDurationMs: 12000, cumulativeDurationMs: 12000 });

      await repo.clearLaps('swim-X');

      const lapsX = await repo.getLaps('swim-X');
      const lapsY = await repo.getLaps('swim-Y');

      assert.strictEqual(lapsX.length, 0, 'Swimmer X laps should be cleared');
      assert.strictEqual(lapsY.length, 1, 'Swimmer Y laps should remain intact');
    });

    test('TC-T2-203: deleteLap removes single lap by ID', async () => {
      const lapId = 'lap-manual-123';
      await repo.saveLap({ id: lapId, swimmerId: 'swim-Z', lapNumber: 1, splitDurationMs: 15000, cumulativeDurationMs: 15000 });
      assert.strictEqual((await repo.getLaps('swim-Z')).length, 1);

      await repo.deleteLap(lapId);
      assert.strictEqual((await repo.getLaps('swim-Z')).length, 0);
    });
  });

  // ==========================================
  // Group 4: Settings & Cross-Reload Persistence
  // ==========================================
  describe('Settings & Hard Reload Simulation', () => {
    test('TC-T1-405: Hard Reload Simulation - complete state rehydration with fresh repository instance', async () => {
      // 1. Setup session data prior to simulated browser reload
      await repo.saveSwimmer({ id: 's1', name: 'Reload Swimmer', lane: 1, baseline100mSeconds: 60.0 });
      await repo.saveTimerState({
        swimmerId: 's1',
        state: 'RUNNING',
        startTime: 100000,
        lastResumeTime: 105000,
        accumulatedMs: 5000,
        currentLapIndex: 3
      });
      await repo.saveLap({ swimmerId: 's1', lapNumber: 1, splitDurationMs: 2500, cumulativeDurationMs: 2500 });
      await repo.saveLap({ swimmerId: 's1', lapNumber: 2, splitDurationMs: 2500, cumulativeDurationMs: 5000 });
      await repo.saveSetting('activeSession', 'session-123');

      // 2. Simulate page reload by closing DB connection and instantiating fresh SwimmerRepository
      closeDB();
      const freshRepo = new SwimmerRepository();
      await freshRepo.init();

      // 3. Verify complete rehydration
      const swimmers = await freshRepo.getSwimmers();
      assert.strictEqual(swimmers.length, 1);
      assert.strictEqual(swimmers[0].name, 'Reload Swimmer');

      const timerState = await freshRepo.getTimerState('s1');
      assert.ok(timerState);
      assert.strictEqual(timerState.state, 'RUNNING');
      assert.strictEqual(timerState.accumulatedMs, 5000);
      assert.strictEqual(timerState.lastResumeTime, 105000);

      const laps = await freshRepo.getLaps('s1');
      assert.strictEqual(laps.length, 2);
      assert.strictEqual(laps[0].splitDurationMs, 2500);
      assert.strictEqual(laps[1].cumulativeDurationMs, 5000);

      const setting = await freshRepo.getSetting('activeSession');
      assert.strictEqual(setting, 'session-123');
    });

    test('TC-T2-401: clearAll resets all stores cleanly', async () => {
      await repo.saveSwimmer({ id: 's1', name: 'Temp', lane: 1, baseline100mSeconds: 60 });
      await repo.saveTimerState({ swimmerId: 's1', state: 'IDLE', accumulatedMs: 0 });
      await repo.saveLap({ swimmerId: 's1', lapNumber: 1, splitDurationMs: 1000, cumulativeDurationMs: 1000 });
      await repo.saveSetting('testKey', 'testVal');

      await repo.clearAll();

      assert.strictEqual((await repo.getSwimmers()).length, 0);
      assert.strictEqual((await repo.getAllTimerStates()).length, 0);
      assert.strictEqual((await repo.getLaps('s1')).length, 0);
      assert.strictEqual(await repo.getSetting('testKey'), null);
    });
  });
});
