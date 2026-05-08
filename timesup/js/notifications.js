// TimesUp Notifications Manager
const Notifications = {
  permission: 'default',

  async requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') {
      this.permission = 'granted';
      return 'granted';
    }
    if (Notification.permission === 'denied') {
      this.permission = 'denied';
      return 'denied';
    }
    try {
      const result = await Notification.requestPermission();
      this.permission = result;
      return result;
    } catch { return 'denied'; }
  },

  canNotify() {
    const settings = Storage.getSettings();
    return settings.notifications && Notification.permission === 'granted';
  },

  show(title, body, options = {}) {
    if (!this.canNotify()) return;
    try {
      const notif = new Notification(title, {
        body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-72.png',
        tag: options.tag || 'timesup',
        ...options
      });
      notif.onclick = () => { window.focus(); notif.close(); };
      setTimeout(() => notif.close(), options.duration || 8000);
      return notif;
    } catch (e) { console.log('[Notif] Error:', e); }
  },

  // Mood check periods
  checkMoodTime() {
    const settings = Storage.getSettings();
    if (!settings.notifications) return null;

    const hour = new Date().getHours();
    let period = null;

    if (hour >= 6 && hour < 12 && settings.notifMorning) period = 'morning';
    else if (hour >= 12 && hour < 17 && settings.notifAfternoon) period = 'afternoon';
    else if (hour >= 17 && hour < 23 && settings.notifEvening) period = 'evening';

    if (!period) return null;
    if (Storage.hasShownNotifToday(period)) return null;

    return period;
  },

  markMoodShown(period) {
    Storage.setNotifTime(period);
  },

  scheduleStudyReminder(minutesLater = 60) {
    if (!this.canNotify()) return;
    setTimeout(() => {
      this.show('⏰ وقت مطالعه!', 'بزن بریم! یه سشن مطالعه خوب در انتظاریه 💪', { tag: 'study-reminder' });
    }, minutesLater * 60 * 1000);
  },
};

window.Notifications = Notifications;
