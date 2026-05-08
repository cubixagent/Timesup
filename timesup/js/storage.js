// TimesUp Storage Manager
const Storage = {
  // Keys
  KEYS: {
    SESSIONS: 'tu_sessions',
    USER_PROFILE: 'tu_profile',
    SETTINGS: 'tu_settings',
    MOODS: 'tu_moods',
    DISTRACTIONS: 'tu_distractions',
    ONBOARDED: 'tu_onboarded',
    LAST_VERSION: 'tu_last_version',
    NOTIFICATIONS: 'tu_notif_times',
    ACTIVE_TIMER: 'tu_active_timer',
  },

  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch { return fallback; }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch { return false; }
  },

  remove(key) {
    localStorage.removeItem(key);
  },

  // Sessions
  getSessions() { return this.get(this.KEYS.SESSIONS, []); },
  addSession(session) {
    const sessions = this.getSessions();
    session.id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    sessions.push(session);
    this.set(this.KEYS.SESSIONS, sessions);
    return session;
  },
  updateSession(id, updates) {
    const sessions = this.getSessions();
    const idx = sessions.findIndex(s => s.id === id);
    if (idx >= 0) { sessions[idx] = { ...sessions[idx], ...updates }; this.set(this.KEYS.SESSIONS, sessions); }
  },
  deleteSession(id) {
    const sessions = this.getSessions().filter(s => s.id !== id);
    this.set(this.KEYS.SESSIONS, sessions);
  },

  // Today's sessions
  getTodaySessions() {
    const today = new Date().toDateString();
    return this.getSessions().filter(s => new Date(s.startTime).toDateString() === today && s.completed);
  },

  // User profile
  getProfile() {
    return this.get(this.KEYS.USER_PROFILE, {
      name: '', field: '', university: '', targetRank: '', avatar: '🎯'
    });
  },
  setProfile(profile) { this.set(this.KEYS.USER_PROFILE, profile); },

  // Settings
  getSettings() {
    return this.get(this.KEYS.SETTINGS, {
      theme: 'auto',
      showSeconds: true,
      timerFont: 'mono',
      notifications: true,
      notifMorning: true,
      notifAfternoon: true,
      notifEvening: true,
      appVersion: '1.0.0',
    });
  },
  setSettings(settings) { this.set(this.KEYS.SETTINGS, settings); },
  updateSetting(key, value) {
    const s = this.getSettings();
    s[key] = value;
    this.setSettings(s);
  },

  // Moods
  getMoods() { return this.get(this.KEYS.MOODS, []); },
  addMood(mood) {
    const moods = this.getMoods();
    mood.id = Date.now().toString(36);
    moods.push(mood);
    this.set(this.KEYS.MOODS, moods);
    return mood;
  },
  getTodayMoods() {
    const today = new Date().toDateString();
    return this.getMoods().filter(m => new Date(m.timestamp).toDateString() === today);
  },

  // Distractions
  getDistractions() { return this.get(this.KEYS.DISTRACTIONS, []); },
  addDistraction(sessionId) {
    const d = this.getDistractions();
    const entry = { sessionId, timestamp: Date.now(), hour: new Date().getHours(), minute: new Date().getMinutes() };
    d.push(entry);
    this.set(this.KEYS.DISTRACTIONS, d);
  },

  // Onboarding
  isOnboarded() { return this.get(this.KEYS.ONBOARDED, false); },
  setOnboarded() { this.set(this.KEYS.ONBOARDED, true); },

  // Notification times tracking
  getNotifTimes() { return this.get(this.KEYS.NOTIFICATIONS, {}); },
  setNotifTime(period) {
    const t = this.getNotifTimes();
    t[period] = new Date().toDateString();
    this.set(this.KEYS.NOTIFICATIONS, t);
  },
  hasShownNotifToday(period) {
    const t = this.getNotifTimes();
    return t[period] === new Date().toDateString();
  },

  // Active timer persistence (for background)
  saveActiveTimer(data) { this.set(this.KEYS.ACTIVE_TIMER, data); },
  getActiveTimer() { return this.get(this.KEYS.ACTIVE_TIMER, null); },
  clearActiveTimer() { this.remove(this.KEYS.ACTIVE_TIMER); },

  // Week stats
  getWeekSessions() {
    const week = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      week.push(d.toDateString());
    }
    const sessions = this.getSessions().filter(s => s.completed);
    return week.map(day => {
      const daySessions = sessions.filter(s => new Date(s.startTime).toDateString() === day);
      const totalSeconds = daySessions.reduce((sum, s) => sum + (s.duration || 0), 0);
      return { day, sessions: daySessions, totalSeconds, totalHours: totalSeconds / 3600 };
    });
  },

  // Export all data
  exportData() {
    return {
      exportDate: new Date().toISOString(),
      version: '1.0.0',
      sessions: this.getSessions(),
      profile: this.getProfile(),
      settings: this.getSettings(),
      moods: this.getMoods(),
      distractions: this.getDistractions(),
    };
  },

  // Import data
  importData(data) {
    if (!data || !data.version) return false;
    try {
      if (data.sessions) this.set(this.KEYS.SESSIONS, data.sessions);
      if (data.profile) this.set(this.KEYS.USER_PROFILE, data.profile);
      if (data.settings) this.set(this.KEYS.SETTINGS, data.settings);
      if (data.moods) this.set(this.KEYS.MOODS, data.moods);
      if (data.distractions) this.set(this.KEYS.DISTRACTIONS, data.distractions);
      return true;
    } catch { return false; }
  },

  // Full reset
  resetAll() {
    Object.values(this.KEYS).forEach(k => localStorage.removeItem(k));
  },

  // Stats helpers
  getTotalStudyTime() {
    return this.getSessions().filter(s => s.completed).reduce((sum, s) => sum + (s.duration || 0), 0);
  },
  getTodayStudyTime() {
    return this.getTodaySessions().reduce((sum, s) => sum + (s.duration || 0), 0);
  },
  getStreakDays() {
    const sessions = this.getSessions().filter(s => s.completed);
    if (!sessions.length) return 0;
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toDateString();
      if (sessions.some(s => new Date(s.startTime).toDateString() === ds)) streak++;
      else if (i > 0) break;
    }
    return streak;
  },
  getHeatmapData() {
    // Returns distraction count per 30-min slot (0-47 slots)
    const d = this.getDistractions();
    const slots = Array(48).fill(0);
    d.forEach(dist => {
      const slot = dist.hour * 2 + (dist.minute >= 30 ? 1 : 0);
      if (slot >= 0 && slot < 48) slots[slot]++;
    });
    return slots;
  },
};

window.Storage = Storage;
