// Verification script for Milestone 1: PWA Shell & Storage Engine
import assert from 'node:assert/strict';
import { repository, SwimmerRepository } from '../../../js/storage/repository.js';
import { openDB, STORES, closeDB } from '../../../js/storage/db.js';

async function runM1StorageVerification() {
  console.log('--- Starting M1 Storage Verification ---');

  // Test 1: Repository initialization
  await repository.init();
  assert.equal(repository.isInitialized, true, 'Repository should be initialized');
  console.log('✓ Test 1: repository.init() succeeded');

  // Clear any existing state for clean test
  await repository.clearAll();

  // Test 2: Swimmer CRUD
  const swimmerA = {
    id: 'swimmer-1',
    name: 'Michael Phelps',
    lane: 4,
    baseline100m: 47.5
  };
  const swimmerB = {
    id: 'swimmer-2',
    name: 'Katie Ledecky',
    lane: 5,
    baseline100m: 53.8
  };

  await repository.saveSwimmer(swimmerA);
  await repository.saveSwimmer(swimmerB);

  const swimmers = await repository.getSwimmers();
  assert.equal(swimmers.length, 2, 'Should have 2 swimmers');
  assert.equal(swimmers[0].name, 'Michael Phelps');
  assert.equal(swimmers[1].name, 'Katie Ledecky');
  console.log('✓ Test 2: saveSwimmer and getSwimmers verified');

  const fetchedA = await repository.getSwimmer('swimmer-1');
  assert.deepEqual(fetchedA, swimmerA, 'getSwimmer should match saved object');
  console.log('✓ Test 3: getSwimmer by ID verified');

  // Test 4: Timer State persistence
  const timerStateA = {
    swimmerId: 'swimmer-1',
    status: 'running',
    startTime: 1000000,
    lastResumeTime: 1000000,
    accumulatedMs: 15420
  };
  await repository.saveTimerState(timerStateA);

  const fetchedTimerState = await repository.getTimerState('swimmer-1');
  assert.deepEqual(fetchedTimerState, timerStateA, 'getTimerState should match saved timer state');

  const allTimerStates = await repository.getAllTimerStates();
  assert.equal(allTimerStates.length, 1);
  console.log('✓ Test 4: saveTimerState and getTimerState verified');

  // Test 5: Laps persistence & index ordering
  const lap1 = {
    id: 'lap-1-1',
    swimmerId: 'swimmer-1',
    lapNumber: 1,
    splitMs: 28500,
    cumulativeMs: 28500,
    timestamp: 1028500
  };
  const lap2 = {
    id: 'lap-1-2',
    swimmerId: 'swimmer-1',
    lapNumber: 2,
    splitMs: 29100,
    cumulativeMs: 57600,
    timestamp: 1057600
  };
  const lap3 = {
    id: 'lap-1-3',
    swimmerId: 'swimmer-1',
    lapNumber: 3,
    splitMs: 28900,
    cumulativeMs: 86500,
    timestamp: 1086500
  };
  const lapOther = {
    id: 'lap-2-1',
    swimmerId: 'swimmer-2',
    lapNumber: 1,
    splitMs: 31200,
    cumulativeMs: 31200,
    timestamp: 1031200
  };

  // Save out of order to verify sorting
  await repository.saveLap(lap2);
  await repository.saveLap(lap1);
  await repository.saveLap(lap3);
  await repository.saveLap(lapOther);

  const lapsA = await repository.getLaps('swimmer-1');
  assert.equal(lapsA.length, 3, 'Swimmer 1 should have 3 laps');
  assert.equal(lapsA[0].lapNumber, 1, 'Laps should be ordered by lapNumber');
  assert.equal(lapsA[1].lapNumber, 2);
  assert.equal(lapsA[2].lapNumber, 3);
  assert.equal(lapsA[0].splitMs, 28500);

  const lapsB = await repository.getLaps('swimmer-2');
  assert.equal(lapsB.length, 1, 'Swimmer 2 should have 1 lap');
  assert.equal(lapsB[0].splitMs, 31200);
  console.log('✓ Test 5: saveLap and getLaps ordering & swimmer indexing verified');

  // Test 6: Clear laps for swimmer 1 only
  await repository.clearLaps('swimmer-1');
  const lapsAfterClearA = await repository.getLaps('swimmer-1');
  assert.equal(lapsAfterClearA.length, 0, 'Swimmer 1 laps should be cleared');
  const lapsAfterClearB = await repository.getLaps('swimmer-2');
  assert.equal(lapsAfterClearB.length, 1, 'Swimmer 2 laps should remain intact');
  console.log('✓ Test 6: clearLaps isolated per swimmer verified');

  // Test 7: Cascade delete swimmer
  await repository.saveLap({
    id: 'lap-2-2',
    swimmerId: 'swimmer-2',
    lapNumber: 2,
    splitMs: 31500,
    cumulativeMs: 62700,
    timestamp: 1062700
  });
  await repository.saveTimerState({
    swimmerId: 'swimmer-2',
    status: 'paused',
    startTime: 2000000,
    lastResumeTime: 2000000,
    accumulatedMs: 62700
  });

  await repository.deleteSwimmer('swimmer-2');
  const remainingSwimmers = await repository.getSwimmers();
  assert.equal(remainingSwimmers.length, 1);
  assert.equal(remainingSwimmers[0].id, 'swimmer-1');

  const swimmer2Timer = await repository.getTimerState('swimmer-2');
  assert.equal(swimmer2Timer, null, 'Deleted swimmer timer state should be cascade deleted');

  const swimmer2Laps = await repository.getLaps('swimmer-2');
  assert.equal(swimmer2Laps.length, 0, 'Deleted swimmer laps should be cascade deleted');
  console.log('✓ Test 7: deleteSwimmer cascade deletion verified');

  // Test 8: Settings
  await repository.saveSetting('theme', 'poolside-dark');
  const themeVal = await repository.getSetting('theme');
  assert.equal(themeVal, 'poolside-dark');
  console.log('✓ Test 8: Settings get/save verified');

  // Clean up
  closeDB();
  console.log('--- All M1 Storage Verification Tests Passed! ---');
}

runM1StorageVerification().catch((err) => {
  console.error('M1 Storage Verification Failed:', err);
  process.exit(1);
});
