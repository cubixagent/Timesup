// TimesUp Timer Engine
const Timer = {
  state: 'idle', // idle | running | paused | finished
  startTimestamp: null,
  pausedAt: null,
  totalPausedMs: 0,
  elapsedMs: 0,
  sessionId: null,
  sessionData: null,
  rafId: null,
  bgInterval: null,
  MAX_BG_SECONDS: 3 * 60 * 60, // 3 hours background limit
  _distractionCount: 0,
  _callbacks: {},

  on(event, cb) { this._callbacks[event] = cb; },
  emit(event, data) { if (this._callbacks[event]) this._callbacks[event](data); },

  get elapsed() {
    if (this.state === 'idle' || this.state === 'finished') return this.elapsedMs;
    if (this.state === 'paused') return this.elapsedMs;
    return this.elapsedMs + (Date.now() - this.startTimestamp);
  },

  get seconds() { return Math.floor(this.elapsed / 1000); },

  start(sessionData) {
    this.sessionData = sessionData;
    this.startTimestamp = Date.now();
    this.totalPausedMs = 0;
    this.elapsedMs = 0;
    this.state = 'running';
    this._distractionCount = 0;

    // Create session record
    const session = Storage.addSession({
      subject: sessionData.subject,
      topic: sessionData.topic,
      startTime: Date.now(),
      completed: false,
      duration: 0,
    });
    this.sessionId = session.id;

    this._saveToStorage();
    this._startRaf();
    this._startBgHeartbeat();
    this.emit('start', { sessionId: this.sessionId });
  },

  pause() {
    if (this.state !== 'running') return;
    this.elapsedMs += Date.now() - this.startTimestamp;
    this.pausedAt = Date.now();
    this.state = 'paused';
    this._stopRaf();
    this._saveToStorage();
    this.emit('pause', { elapsed: this.elapsedMs });
  },

  resume() {
    if (this.state !== 'paused') return;
    this.startTimestamp = Date.now();
    this.totalPausedMs += Date.now() - this.pausedAt;
    this.state = 'running';
    this._startRaf();
    this._saveToStorage();
    this.emit('resume');
  },

  stop() {
    if (this.state === 'idle') return;
    if (this.state === 'running') {
      this.elapsedMs += Date.now() - this.startTimestamp;
    }
    this.state = 'finished';
    this._stopRaf();
    this._stopBgHeartbeat();

    // Update session
    Storage.updateSession(this.sessionId, {
      duration: Math.floor(this.elapsedMs / 1000),
      endTime: Date.now(),
    });
    Storage.clearActiveTimer();
    this.emit('stop', { 
      duration: Math.floor(this.elapsedMs / 1000),
      sessionId: this.sessionId,
      distractions: this._distractionCount
    });
  },

  complete(testCount, satisfaction) {
    const duration = Math.floor(this.elapsedMs / 1000);
    Storage.updateSession(this.sessionId, {
      duration,
      endTime: Date.now(),
      testCount: testCount || 0,
      satisfaction: satisfaction || 5,
      distractions: this._distractionCount,
      completed: true,
    });
    Storage.clearActiveTimer();
    this.state = 'idle';
    this._stopRaf();
    this._stopBgHeartbeat();
    this.emit('complete', { duration, sessionId: this.sessionId });
  },

  markDistraction() {
    if (this.state !== 'running') return;
    this._distractionCount++;
    Storage.addDistraction(this.sessionId);
    this.emit('distraction', { count: this._distractionCount, timestamp: Date.now() });
  },

  reset() {
    this._stopRaf();
    this._stopBgHeartbeat();
    this.state = 'idle';
    this.startTimestamp = null;
    this.elapsedMs = 0;
    this.pausedAt = null;
    this.totalPausedMs = 0;
    this.sessionId = null;
    this.sessionData = null;
    this._distractionCount = 0;
    Storage.clearActiveTimer();
  },

  // Restore timer from storage (app reopened)
  restoreFromStorage() {
    const saved = Storage.getActiveTimer();
    if (!saved) return false;

    const now = Date.now();
    const bgElapsed = (now - saved.savedAt) / 1000;

    if (bgElapsed > this.MAX_BG_SECONDS) {
      // Too long in background - auto stop
      Storage.updateSession(saved.sessionId, {
        duration: saved.elapsedMs / 1000 + Math.min(bgElapsed, this.MAX_BG_SECONDS),
        endTime: now,
        completed: false,
        stoppedInBackground: true,
      });
      Storage.clearActiveTimer();
      this.emit('bg_timeout', { sessionId: saved.sessionId });
      return false;
    }

    this.sessionId = saved.sessionId;
    this.sessionData = saved.sessionData;
    this._distractionCount = saved.distractionCount || 0;

    if (saved.state === 'running') {
      // Was running in background - add background time to elapsed
      this.elapsedMs = saved.elapsedMs + (now - saved.savedAt);
      this.startTimestamp = now;
      this.state = 'running';
      this._startRaf();
      this._startBgHeartbeat();
    } else if (saved.state === 'paused') {
      this.elapsedMs = saved.elapsedMs;
      this.state = 'paused';
    }

    this.emit('restored', { state: this.state, elapsed: this.elapsedMs });
    return true;
  },

  _saveToStorage() {
    Storage.saveActiveTimer({
      state: this.state,
      elapsedMs: this.elapsedMs,
      startTimestamp: this.startTimestamp,
      savedAt: Date.now(),
      sessionId: this.sessionId,
      sessionData: this.sessionData,
      distractionCount: this._distractionCount,
    });
  },

  _startRaf() {
    let lastSave = Date.now();
    const tick = () => {
      if (this.state !== 'running') return;
      this.emit('tick', { elapsed: this.elapsed, seconds: this.seconds });
      // Save to storage every 10 seconds while running
      if (Date.now() - lastSave > 10000) {
        this._saveToStorage();
        lastSave = Date.now();
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  },

  _stopRaf() {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  },

  _startBgHeartbeat() {
    // Ping service worker every minute to keep alive
    this.bgInterval = setInterval(() => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'KEEP_ALIVE' });
      }
      if (this.state === 'running') this._saveToStorage();
    }, 30000);
  },

  _stopBgHeartbeat() {
    if (this.bgInterval) { clearInterval(this.bgInterval); this.bgInterval = null; }
  },

  // Format elapsed time
  formatTime(ms, showSeconds = true) {
    const totalSec = Math.floor((ms ?? this.elapsed) / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (showSeconds) {
      if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
      return `${pad(m)}:${pad(s)}`;
    } else {
      if (h > 0) return `${pad(h)}:${pad(m)}`;
      return `${pad(m)}`;
    }
  },
};

function pad(n) { return String(n).padStart(2, '0'); }
window.Timer = Timer;
