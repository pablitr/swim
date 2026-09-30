// App Coordinator - SwimCoach Tracker Master Controller
// Initializes storage, rehydrates running timers on hard reload, and manages master heat controls.

import { repository } from './storage/repository.js';
import { timerEngine, TIMER_STATES } from './timing/timer-engine.js';
import { SwimmerCard } from './ui/swimmer-card.js';
import { modalManager } from './ui/modal.js';

class AppCoordinator {
  constructor() {
    this.cards = new Map();
    this.gridEl = null;

    this.handleMasterStart = this.handleMasterStart.bind(this);
    this.handleMasterStop = this.handleMasterStop.bind(this);
    this.handleMasterReset = this.handleMasterReset.bind(this);
    this.handleSaveSwimmer = this.handleSaveSwimmer.bind(this);
    this.handleDeleteSwimmer = this.handleDeleteSwimmer.bind(this);
  }

  /**
   * Bootstraps the application
   */
  async init() {
    this.gridEl = document.getElementById('swimmer-grid');

    // 1. Initialize IndexedDB storage and timing engine
    await repository.init();
    await timerEngine.init(repository);

    // 2. Wire up Master Heat Controls
    const btnStartAll = document.getElementById('btn-master-start');
    const btnStopAll = document.getElementById('btn-master-stop');
    const btnResetAll = document.getElementById('btn-master-reset');
    const btnAddTrigger = document.getElementById('btn-add-swimmer-trigger');

    if (btnStartAll) btnStartAll.addEventListener('click', this.handleMasterStart);
    if (btnStopAll) btnStopAll.addEventListener('click', this.handleMasterStop);
    if (btnResetAll) btnResetAll.addEventListener('click', this.handleMasterReset);
    if (btnAddTrigger) {
      btnAddTrigger.addEventListener('click', () => modalManager.open());
    }

    // 3. Initialize modal controller
    modalManager.init({
      onSave: this.handleSaveSwimmer
    });

    // 4. Load persisted data & rehydrate timers across reload
    await this.loadSwimmers();
  }

  /**
   * Load registered swimmers, timer states, and laps from IndexedDB
   */
  async loadSwimmers() {
    if (!this.gridEl) return;

    // Clear existing cards
    for (const card of this.cards.values()) {
      card.destroy();
    }
    this.cards.clear();
    this.gridEl.innerHTML = '';

    const swimmers = await repository.getSwimmers();
    const timerStates = await repository.getAllTimerStates();
    const timerStateMap = new Map(timerStates.map(s => [s.swimmerId, s]));

    if (swimmers.length === 0) {
      this._renderEmptyState();
      return;
    }

    for (const swimmer of swimmers) {
      const timerState = timerStateMap.get(swimmer.id) || {
        swimmerId: swimmer.id,
        state: TIMER_STATES.IDLE,
        startTime: null,
        lastResumeTime: null,
        accumulatedMs: 0,
        currentLapIndex: 1,
        lastLapCumulativeMs: 0
      };

      const laps = await repository.getLaps(swimmer.id);

      const card = new SwimmerCard({
        swimmer,
        timerState,
        laps,
        callbacks: {
          onEdit: (swimmerData) => modalManager.open(swimmerData),
          onDelete: (swimmerId) => this.handleDeleteSwimmer(swimmerId),
          onClearLaps: (swimmerId) => {
            console.log(`[App] Laps cleared for swimmer ${swimmerId}`);
          },
          onTimerChange: (swimmerId, newState) => {
            console.log(`[App] Timer transition for ${swimmerId}:`, newState.state);
          }
        }
      });

      card.mount(this.gridEl);
      this.cards.set(swimmer.id, card);
    }
  }

  /**
   * Master Control: Start all timers simultaneously
   */
  async handleMasterStart() {
    const promises = [];
    for (const card of this.cards.values()) {
      if (card.timerState.state === TIMER_STATES.IDLE || card.timerState.state === TIMER_STATES.STOPPED) {
        promises.push(card.handleStart());
      } else if (card.timerState.state === TIMER_STATES.PAUSED) {
        promises.push(card.handleResume());
      }
    }
    await Promise.all(promises);
  }

  /**
   * Master Control: Stop all running or paused timers
   */
  async handleMasterStop() {
    const promises = [];
    for (const card of this.cards.values()) {
      if (card.timerState.state === TIMER_STATES.RUNNING || card.timerState.state === TIMER_STATES.PAUSED) {
        promises.push(card.handleStop());
      }
    }
    await Promise.all(promises);
  }

  /**
   * Master Control: Reset all timers to 00:00.00
   */
  async handleMasterReset() {
    if (this.cards.size === 0) return;
    const confirmed = confirm('Reset all timers in this heat to zero?');
    if (!confirmed) return;

    const promises = [];
    for (const card of this.cards.values()) {
      promises.push(card.handleReset());
    }
    await Promise.all(promises);
  }

  /**
   * Save (create or update) swimmer profile
   * @param {Object} swimmerData
   */
  async handleSaveSwimmer(swimmerData) {
    const isNew = !swimmerData.id;
    await repository.saveSwimmer(swimmerData);

    if (isNew) {
      // Initialize IDLE timer state for new swimmer
      await timerEngine.reset(swimmerData.id);
    }

    // Refresh swimmer grid
    await this.loadSwimmers();
  }

  /**
   * Delete swimmer profile and cascade remove timer & laps
   * @param {string} swimmerId
   */
  async handleDeleteSwimmer(swimmerId) {
    await repository.deleteSwimmer(swimmerId);
    this.cards.delete(swimmerId);
    if (this.cards.size === 0) {
      this._renderEmptyState();
    }
  }

  _renderEmptyState() {
    if (!this.gridEl) return;
    this.gridEl.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-state-title">No Swimmers in Heat</h2>
        <p style="margin-bottom: var(--space-4);">Add your swimmers to start tracking simultaneous laps and sustainable paces.</p>
        <button id="btn-empty-add" class="btn-master btn-start-all" style="display:inline-flex;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add First Swimmer
        </button>
      </div>
    `;

    const addBtn = document.getElementById('btn-empty-add');
    if (addBtn) {
      addBtn.addEventListener('click', () => modalManager.open());
    }
  }
}

// Automatically bootstrap when DOM is ready
export const app = new AppCoordinator();

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
  } else {
    app.init();
  }
}

export default app;
