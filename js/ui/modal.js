// ModalManager - Add/Edit Swimmer Dialog Controller
// Handles modal opening, closing, prefilling for edits, and form validation.

export class ModalManager {
  constructor() {
    this.modalEl = null;
    this.formEl = null;
    this.titleEl = null;
    this.idInput = null;
    this.nameInput = null;
    this.laneInput = null;
    this.baselineInput = null;
    this.closeBtn = null;
    this.cancelBtn = null;
    this.onSaveCallback = null;
    this.isOpen = false;

    this.open = this.open.bind(this);
    this.close = this.close.bind(this);
    this._handleSubmit = this._handleSubmit.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);
  }

  /**
   * Initialize DOM element bindings
   * @param {Object} [options]
   * @param {Function} [options.onSave]
   */
  init({ onSave } = {}) {
    if (typeof document === 'undefined') return;

    this.modalEl = document.getElementById('swimmer-modal');
    this.formEl = document.getElementById('swimmer-form');
    this.titleEl = document.getElementById('modal-title');
    this.idInput = document.getElementById('swimmer-id-input');
    this.nameInput = document.getElementById('swimmer-name-input');
    this.laneInput = document.getElementById('swimmer-lane-input');
    this.baselineInput = document.getElementById('swimmer-baseline-input');
    this.closeBtn = document.getElementById('modal-close-btn');
    this.cancelBtn = document.getElementById('modal-cancel-btn');

    if (onSave) this.onSaveCallback = onSave;

    if (this.closeBtn) this.closeBtn.addEventListener('click', this.close);
    if (this.cancelBtn) this.cancelBtn.addEventListener('click', this.close);

    if (this.modalEl) {
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) {
          this.close();
        }
      });
    }

    if (this.formEl) {
      this.formEl.addEventListener('submit', this._handleSubmit);
    }

    document.addEventListener('keydown', this._handleKeyDown);
  }

  /**
   * Open modal in Add or Edit mode
   * @param {Object|null} swimmer - If provided, opens in edit mode
   */
  open(swimmer = null) {
    if (!this.modalEl) this.init();
    if (!this.modalEl) return;

    if (swimmer && swimmer.id) {
      if (this.titleEl) this.titleEl.textContent = 'Editar Nadador';
      if (this.idInput) this.idInput.value = swimmer.id;
      if (this.nameInput) this.nameInput.value = swimmer.name || '';
      if (this.laneInput) this.laneInput.value = swimmer.lane ?? '';
      if (this.baselineInput) this.baselineInput.value = swimmer.baseline100mSeconds ?? '';
    } else {
      if (this.titleEl) this.titleEl.textContent = 'Añadir Nadador';
      if (this.idInput) this.idInput.value = '';
      if (this.nameInput) this.nameInput.value = '';
      if (this.laneInput) this.laneInput.value = '';
      if (this.baselineInput) this.baselineInput.value = '';
    }

    this.modalEl.classList.add('open');
    this.modalEl.setAttribute('aria-hidden', 'false');
    this.isOpen = true;

    if (this.nameInput) {
      setTimeout(() => this.nameInput.focus(), 50);
    }
  }

  /**
   * Close modal and reset fields
   */
  close() {
    if (!this.modalEl) return;
    this.modalEl.classList.remove('open');
    this.modalEl.setAttribute('aria-hidden', 'true');
    this.isOpen = false;
    if (this.formEl) this.formEl.reset();
  }

  /**
   * Register save callback
   * @param {Function} cb
   */
  onSave(cb) {
    this.onSaveCallback = cb;
  }

  /**
   * Form submit event handler
   * @private
   */
  async _handleSubmit(e) {
    e.preventDefault();

    const name = this.nameInput ? this.nameInput.value.trim() : '';
    if (!name) {
      alert('Por favor, ingresa el nombre del nadador.');
      if (this.nameInput) this.nameInput.focus();
      return;
    }

    const id = this.idInput && this.idInput.value ? this.idInput.value : undefined;
    const laneRaw = this.laneInput ? this.laneInput.value.trim() : '';
    const baselineRaw = this.baselineInput ? this.baselineInput.value.trim() : '';

    const swimmerData = {
      name,
      lane: laneRaw ? parseInt(laneRaw, 10) : null,
      baseline100mSeconds: baselineRaw ? parseFloat(baselineRaw) : null
    };

    if (id) {
      swimmerData.id = id;
    }

    if (this.onSaveCallback) {
      await this.onSaveCallback(swimmerData);
    }

    this.close();
  }

  /**
   * Keyboard Escape handler
   * @private
   */
  _handleKeyDown(e) {
    if (e.key === 'Escape' && this.isOpen) {
      this.close();
    }
  }
}

export const modalManager = new ModalManager();
export default modalManager;
