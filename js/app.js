// TimesUp - Main App Controller
const App = {
  currentPage: 'home',
  swRegistration: null,

  async init() {
    this.applyTheme();
    await this.registerSW();
    this.checkUpdate();
    await Notifications.requestPermission();

    if (!Storage.isOnboarded()) {
      this.showOnboarding();
    } else {
      this.showPage('home');
      this.checkMoodPopup();
      this.checkProfileCompletion();
    }

    // Restore timer if app was closed while running
    const restored = Timer.restoreFromStorage();
    if (restored) {
      setTimeout(() => this.showPage('timer'), 300);
    }

    this.bindTimerEvents();
    this.bindNavEvents();
    this.bindSettingsEvents();

    // Handle visibility change for background timer
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (Timer.state === 'running') {
          this.updateTimerDisplay();
        }
        this.checkMoodPopup();
      }
    });

    // Mood popup interval check
    setInterval(() => this.checkMoodPopup(), 5 * 60 * 1000);
  },

  // ─── SERVICE WORKER & UPDATES ───────────────────────────────────
  async registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      this.swRegistration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data && e.data.type === 'SW_UPDATED') {
          this.showUpdateBanner(e.data.version);
        }
      });
    } catch (e) { console.log('[App] SW registration failed:', e); }
  },

  async checkUpdate() {
    try {
      const res = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      const lastSeen = Storage.get(Storage.KEYS.LAST_VERSION, '0.0.0');
      if (data.version !== lastSeen && lastSeen !== '0.0.0') {
        this.showUpdateBanner(data.version, data.message);
      }
      Storage.set(Storage.KEYS.LAST_VERSION, data.version);
    } catch {}
  },

  showUpdateBanner(version, message) {
    const existing = document.getElementById('update-banner');
    if (existing) return;
    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.className = 'update-banner';
    banner.innerHTML = `
      <span>🔄 نسخه جدید ${version} آماده است! ${message || ''}</span>
      <button id="btn-reload-app" class="btn-update">ریلود و آپدیت</button>
      <button id="btn-dismiss-update" class="btn-dismiss">✕</button>
    `;
    document.body.prepend(banner);
    document.getElementById('btn-reload-app').onclick = () => {
      if (this.swRegistration && this.swRegistration.waiting) {
        this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      window.location.reload();
    };
    document.getElementById('btn-dismiss-update').onclick = () => banner.remove();
  },

  // ─── THEME ──────────────────────────────────────────────────────
  applyTheme() {
    const settings = Storage.getSettings();
    document.documentElement.setAttribute('data-theme', settings.theme || 'auto');
  },

  // ─── ONBOARDING ─────────────────────────────────────────────────
  showOnboarding() {
    document.getElementById('onboarding-overlay').classList.add('active');
    document.getElementById('main-app').classList.remove('active');
    this.bindOnboardingSteps();
  },

  bindOnboardingSteps() {
    let step = 1;
    const totalSteps = 3;
    const show = (s) => {
      document.querySelectorAll('.onboard-step').forEach(el => el.classList.remove('active'));
      document.querySelector(`.onboard-step[data-step="${s}"]`)?.classList.add('active');
      const bar = document.getElementById('onboard-progress');
      if (bar) bar.style.width = `${(s / totalSteps) * 100}%`;
    };
    show(1);

    document.getElementById('btn-onboard-next')?.addEventListener('click', () => {
      if (step < totalSteps) { step++; show(step); }
      else this.finishOnboarding();
    });

    document.getElementById('btn-onboard-skip')?.addEventListener('click', () => {
      this.finishOnboarding();
    });
  },

  finishOnboarding() {
    const profile = {
      name: document.getElementById('ob-name')?.value?.trim() || '',
      field: document.getElementById('ob-field')?.value?.trim() || '',
      university: document.getElementById('ob-uni')?.value?.trim() || '',
      targetRank: document.getElementById('ob-rank')?.value?.trim() || '',
      avatar: '🎯',
    };
    Storage.setProfile(profile);
    Storage.setOnboarded();
    Notifications.requestPermission();

    document.getElementById('onboarding-overlay').classList.remove('active');
    document.getElementById('main-app').classList.add('active');
    this.showPage('home');
    this.checkMoodPopup();
  },

  // ─── NAVIGATION ─────────────────────────────────────────────────
  showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`page-${page}`);
    if (target) {
      target.classList.add('active');
      // Animate in
      target.style.opacity = '0';
      target.style.transform = 'translateY(16px)';
      requestAnimationFrame(() => {
        target.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
        target.style.opacity = '1';
        target.style.transform = 'translateY(0)';
      });
    }
    this.currentPage = page;

    // Update nav
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-btn[data-page="${page}"]`)?.classList.add('active');

    // Page-specific init
    if (page === 'home') { Dashboard.init(); this.renderProfileHeader(); }
    if (page === 'dashboard') { Dashboard.init(); }
    if (page === 'settings') { this.renderSettings(); }
  },

  bindNavEvents() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (page && page !== 'timer') this.showPage(page);
      });
    });
  },

  // ─── PROFILE HEADER ─────────────────────────────────────────────
  renderProfileHeader() {
    const profile = Storage.getProfile();
    const el = document.getElementById('profile-header');
    if (!el) return;
    const isComplete = profile.name && profile.field && profile.university && profile.targetRank;

    if (!isComplete) {
      el.innerHTML = `
        <div class="profile-incomplete">
          <span>⚠️ پروفایل ناقصه!</span>
          <button class="btn-sm" onclick="App.showProfileModal()">تکمیل کن</button>
        </div>`;
    } else {
      el.innerHTML = `
        <div class="profile-card">
          <span class="profile-avatar">${profile.avatar || '🎯'}</span>
          <div class="profile-info">
            <div class="profile-name">${profile.name}</div>
            <div class="profile-goal">${profile.university} · رتبه ${profile.targetRank} · ${profile.field}</div>
          </div>
        </div>`;
    }
  },

  showProfileModal() {
    const profile = Storage.getProfile();
    document.getElementById('modal-name').value = profile.name || '';
    document.getElementById('modal-field').value = profile.field || '';
    document.getElementById('modal-uni').value = profile.university || '';
    document.getElementById('modal-rank').value = profile.targetRank || '';
    this.showModal('profile-modal');
  },

  checkProfileCompletion() {
    const profile = Storage.getProfile();
    if (!profile.name || !profile.university) {
      setTimeout(() => this.showProfileModal(), 1500);
    }
  },

  // ─── MODALS ─────────────────────────────────────────────────────
  showModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('active');
    modal.querySelector('.modal-inner')?.classList.add('slide-up');
  },

  closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
  },

  // ─── TIMER FLOW ─────────────────────────────────────────────────
  bindTimerEvents() {
    Timer.on('tick', ({ elapsed }) => this.updateTimerDisplay(elapsed));
    Timer.on('stop', ({ duration, sessionId }) => this.onTimerStop(duration, sessionId));
    Timer.on('complete', () => {
      Dashboard.renderStats();
      this.showPage('home');
    });
    Timer.on('distraction', ({ count }) => {
      const badge = document.getElementById('distraction-count');
      if (badge) { badge.textContent = count; badge.classList.add('pop'); setTimeout(() => badge.classList.remove('pop'), 300); }
    });
    Timer.on('restored', ({ state, elapsed }) => {
      this.updateTimerDisplay(elapsed);
      this.syncTimerUI(state);
    });
    Timer.on('bg_timeout', () => {
      this.showToast('تایمر بعد از ۳ ساعت در پس‌زمینه متوقف شد', 'warning');
    });

    document.getElementById('btn-start-timer')?.addEventListener('click', () => this.startTimerFlow());
    document.getElementById('btn-pause-resume')?.addEventListener('click', () => this.togglePause());
    document.getElementById('btn-stop-timer')?.addEventListener('click', () => this.confirmStop());
    document.getElementById('btn-distraction')?.addEventListener('click', () => {
      Timer.markDistraction();
      this.showToast('حواس‌پرتی ثبت شد 🫣', 'info');
    });

    // Pre-session modal
    document.getElementById('btn-confirm-session')?.addEventListener('click', () => this.confirmStartSession());
    document.getElementById('btn-cancel-session')?.addEventListener('click', () => this.closeModal('session-start-modal'));

    // Post-session modal
    document.getElementById('btn-confirm-complete')?.addEventListener('click', () => this.completeSession());
    document.getElementById('btn-skip-complete')?.addEventListener('click', () => {
      Timer.complete(0, 5);
      this.closeModal('session-end-modal');
    });
  },

  startTimerFlow() {
    // Show pre-session modal
    this.showModal('session-start-modal');
    document.getElementById('session-subject')?.focus();
  },

  confirmStartSession() {
    const subject = document.getElementById('session-subject')?.value?.trim();
    const topic = document.getElementById('session-topic')?.value?.trim();
    if (!subject) { this.showToast('نام درس را وارد کن!', 'error'); return; }

    this.closeModal('session-start-modal');

    // Switch to timer page with animation
    const timerPage = document.getElementById('page-timer');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    timerPage.classList.add('active');
    timerPage.style.opacity = '0';
    timerPage.style.transform = 'scale(0.97)';

    setTimeout(() => {
      timerPage.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      timerPage.style.opacity = '1';
      timerPage.style.transform = 'scale(1)';
    }, 50);

    // Update timer header
    document.getElementById('timer-subject-display').textContent = subject;
    document.getElementById('timer-topic-display').textContent = topic || '';
    document.getElementById('distraction-count').textContent = '0';

    Timer.start({ subject, topic });
    this.syncTimerUI('running');
    this.currentPage = 'timer';

    // Clear inputs
    document.getElementById('session-subject').value = '';
    document.getElementById('session-topic').value = '';
  },

  updateTimerDisplay(elapsed) {
    const settings = Storage.getSettings();
    const ms = elapsed ?? Timer.elapsed;
    const formatted = Timer.formatTime(ms, settings.showSeconds !== false);
    const display = document.getElementById('timer-display');
    if (display) {
      display.textContent = formatted;
      display.className = `timer-display font-${settings.timerFont || 'mono'}`;
    }
  },

  syncTimerUI(state) {
    const btn = document.getElementById('btn-pause-resume');
    if (!btn) return;
    if (state === 'running') {
      btn.textContent = '⏸ توقف';
      btn.classList.remove('paused');
    } else if (state === 'paused') {
      btn.textContent = '▶️ ادامه';
      btn.classList.add('paused');
    }
  },

  togglePause() {
    if (Timer.state === 'running') {
      Timer.pause();
      this.syncTimerUI('paused');
    } else if (Timer.state === 'paused') {
      Timer.resume();
      this.syncTimerUI('running');
    }
  },

  confirmStop() {
    if (Timer.state === 'idle') return;
    Timer.pause();
    this.syncTimerUI('paused');
    if (confirm('آیا میخوای این جلسه رو پایان بدی؟')) {
      Timer.stop();
      this.showSessionEndModal();
    } else {
      Timer.resume();
      this.syncTimerUI('running');
    }
  },

  onTimerStop(duration, sessionId) {
    this.showSessionEndModal(duration);
  },

  showSessionEndModal(duration) {
    const dStr = fmtHM(duration || Timer.seconds);
    const el = document.getElementById('session-duration-display');
    if (el) el.textContent = dStr;
    document.getElementById('session-tests-input').value = '';
    document.getElementById('session-satisfaction').value = '7';
    this.showModal('session-end-modal');
  },

  completeSession() {
    const tests = parseInt(document.getElementById('session-tests-input')?.value) || 0;
    const sat = parseInt(document.getElementById('session-satisfaction')?.value) || 7;
    Timer.complete(tests, sat);
    this.closeModal('session-end-modal');
    this.showToast('جلسه ذخیره شد ✅', 'success');
    this.showPage('home');
  },

  // ─── MOOD POPUP ─────────────────────────────────────────────────
  checkMoodPopup() {
    const settings = Storage.getSettings();
    if (!settings.notifications) return;
    const period = Notifications.checkMoodTime();
    if (!period) return;

    const messages = {
      morning: 'صبح بخیر! 🌅 امروز چطوری؟',
      afternoon: 'بعدازظهر بخیر! ☀️ حالت چطوره؟',
      evening: 'عصر بخیر! 🌙 شب رو چطور پیش میبری؟',
    };

    this.showMoodPopup(messages[period], period);
  },

  showMoodPopup(message, period) {
    const existing = document.getElementById('mood-popup');
    if (existing) return;

    const popup = document.createElement('div');
    popup.id = 'mood-popup';
    popup.className = 'mood-popup';
    popup.innerHTML = `
      <div class="mood-popup-inner">
        <div class="mood-title">${message}</div>
        <textarea id="mood-text" placeholder="یه جمله بنویس..." maxlength="200" rows="2"></textarea>
        <div class="mood-energy-row">
          <label>انرژی:</label>
          <input type="range" id="mood-energy" min="10" max="100" value="60" step="10">
          <span id="mood-energy-val">60</span>
        </div>
        <div class="mood-actions">
          <button id="btn-save-mood" class="btn-primary">ثبت 💾</button>
          <button id="btn-skip-mood" class="btn-ghost">بعداً</button>
        </div>
      </div>
    `;
    document.body.appendChild(popup);

    requestAnimationFrame(() => popup.classList.add('visible'));

    document.getElementById('mood-energy').oninput = e => {
      document.getElementById('mood-energy-val').textContent = e.target.value;
    };

    document.getElementById('btn-save-mood').onclick = () => {
      Storage.addMood({
        text: document.getElementById('mood-text').value,
        energy: parseInt(document.getElementById('mood-energy').value),
        period,
        timestamp: Date.now(),
      });
      Notifications.markMoodShown(period);
      popup.classList.remove('visible');
      setTimeout(() => popup.remove(), 400);
      this.showToast('حالت ثبت شد 💙', 'info');
    };

    document.getElementById('btn-skip-mood').onclick = () => {
      Notifications.markMoodShown(period);
      popup.classList.remove('visible');
      setTimeout(() => popup.remove(), 400);
    };
  },

  // ─── SETTINGS ───────────────────────────────────────────────────
  renderSettings() {
    const s = Storage.getSettings();
    const p = Storage.getProfile();

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const setChecked = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

    setVal('set-theme', s.theme || 'auto');
    setVal('set-timer-font', s.timerFont || 'mono');
    setChecked('set-show-seconds', s.showSeconds !== false);
    setChecked('set-notif', s.notifications !== false);
    setChecked('set-notif-morning', s.notifMorning !== false);
    setChecked('set-notif-afternoon', s.notifAfternoon !== false);
    setChecked('set-notif-evening', s.notifEvening !== false);

    setVal('set-name', p.name || '');
    setVal('set-field', p.field || '');
    setVal('set-uni', p.university || '');
    setVal('set-rank', p.targetRank || '');
  },

  bindSettingsEvents() {
    // Theme
    document.getElementById('set-theme')?.addEventListener('change', e => {
      Storage.updateSetting('theme', e.target.value);
      document.documentElement.setAttribute('data-theme', e.target.value);
      Dashboard.renderWeekChart();
    });

    // Timer font
    document.getElementById('set-timer-font')?.addEventListener('change', e => {
      Storage.updateSetting('timerFont', e.target.value);
    });

    // Show seconds
    document.getElementById('set-show-seconds')?.addEventListener('change', e => {
      Storage.updateSetting('showSeconds', e.target.checked);
    });

    // Notifications
    document.getElementById('set-notif')?.addEventListener('change', async e => {
      if (e.target.checked) {
        const perm = await Notifications.requestPermission();
        if (perm !== 'granted') {
          e.target.checked = false;
          this.showToast('مجوز اعلان داده نشد. از تنظیمات مرورگر فعال کن.', 'warning');
          return;
        }
      }
      Storage.updateSetting('notifications', e.target.checked);
    });

    ['morning', 'afternoon', 'evening'].forEach(p => {
      document.getElementById(`set-notif-${p}`)?.addEventListener('change', e => {
        Storage.updateSetting(`notif${p.charAt(0).toUpperCase() + p.slice(1)}`, e.target.checked);
      });
    });

    // Profile save
    document.getElementById('btn-save-profile')?.addEventListener('click', () => {
      Storage.setProfile({
        name: document.getElementById('set-name')?.value?.trim(),
        field: document.getElementById('set-field')?.value?.trim(),
        university: document.getElementById('set-uni')?.value?.trim(),
        targetRank: document.getElementById('set-rank')?.value?.trim(),
        avatar: '🎯',
      });
      this.showToast('پروفایل ذخیره شد ✅', 'success');
    });

    // Profile modal save
    document.getElementById('btn-save-profile-modal')?.addEventListener('click', () => {
      Storage.setProfile({
        name: document.getElementById('modal-name')?.value?.trim(),
        field: document.getElementById('modal-field')?.value?.trim(),
        university: document.getElementById('modal-uni')?.value?.trim(),
        targetRank: document.getElementById('modal-rank')?.value?.trim(),
        avatar: '🎯',
      });
      this.closeModal('profile-modal');
      this.renderProfileHeader();
      this.showToast('پروفایل ذخیره شد ✅', 'success');
    });

    // Export backup
    document.getElementById('btn-export')?.addEventListener('click', () => {
      const data = Storage.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timesup-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('بکاپ دانلود شد 💾', 'success');
    });

    // Import backup
    document.getElementById('btn-import')?.addEventListener('click', () => {
      document.getElementById('import-file-input')?.click();
    });
    document.getElementById('import-file-input')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          if (Storage.importData(data)) {
            this.showToast('اطلاعات با موفقیت ایمپورت شد ✅', 'success');
            setTimeout(() => window.location.reload(), 1500);
          } else this.showToast('فایل نامعتبر است!', 'error');
        } catch { this.showToast('خطا در خواندن فایل!', 'error'); }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // Reset
    document.getElementById('btn-reset')?.addEventListener('click', () => {
      const c1 = confirm('⚠️ هشدار! تمام اطلاعات پاک میشه. مطمئنی؟');
      if (!c1) return;
      const c2 = confirm('🚨 این عمل برگشت‌پذیر نیست! واقعاً مطمئنی؟');
      if (!c2) return;
      const c3 = confirm('آخرین تأییدیه: تمام داده‌ها از بین میره. ادامه؟');
      if (!c3) return;
      Storage.resetAll();
      this.showToast('اپلیکیشن ریست شد', 'warning');
      setTimeout(() => window.location.reload(), 1500);
    });

    // PDF report
    document.getElementById('btn-gen-pdf')?.addEventListener('click', async () => {
      this.showToast('در حال ساخت گزارش...', 'info');
      try {
        await PDFGen.generateDailyReport();
        this.showToast('گزارش PDF دانلود شد 📄', 'success');
      } catch (e) {
        console.error(e);
        this.showToast('خطا در ساخت PDF', 'error');
      }
    });
  },

  // ─── TOAST ──────────────────────────────────────────────────────
  showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    document.getElementById('toast-container')?.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
window.App = App;
