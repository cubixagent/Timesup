// TimesUp Dashboard
const Dashboard = {
  charts: {},

  init() {
    this.renderStudyArt();
    this.renderStats();
    this.renderWeekChart();
    this.renderDistractionHeatmap();
    this.renderSessionsList();
  },

  destroy() {
    Object.values(this.charts).forEach(c => c && c.destroy && c.destroy());
    this.charts = {};
  },

  renderStats() {
    const todaySec = Storage.getTodayStudyTime();
    const weekData = Storage.getWeekSessions();
    const weekSec = weekData.reduce((s, d) => s + d.totalSeconds, 0);
    const streak = Storage.getStreakDays();
    const totalSec = Storage.getTotalStudyTime();
    const sessions = Storage.getTodaySessions();
    const totalTests = sessions.reduce((s, ses) => s + (ses.testCount || 0), 0);

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-today', fmtHM(todaySec));
    set('stat-week', fmtHM(weekSec));
    set('stat-streak', streak + ' روز');
    set('stat-total', fmtHM(totalSec));
    set('stat-tests', totalTests);
    set('stat-sessions', sessions.length);
  },

  renderStudyArt() {
    const canvas = document.getElementById('study-art');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth * devicePixelRatio;
    const H = canvas.height = canvas.offsetHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    const w = canvas.offsetWidth, h = canvas.offsetHeight;

    const hours = Storage.getTodayStudyTime() / 3600;
    const streak = Storage.getStreakDays();

    ctx.clearRect(0, 0, w, h);

    // Performance level
    const level = Math.min(Math.floor(hours / 2), 4); // 0-4
    const colors = [
      ['#1a1a2e', '#16213e', '#0f3460'],  // level 0 - dark/dormant
      ['#0d1b2a', '#1b263b', '#415a77'],  // level 1
      ['#0a2e0a', '#1a4a1a', '#2d6a2d'],  // level 2 - green
      ['#1a1a00', '#3a3a00', '#6a6a00'],  // level 3 - gold
      ['#1a0a2e', '#3a1a6a', '#6c63ff'],  // level 4 - purple/fire
    ];
    const c = colors[level];

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, c[0]);
    grad.addColorStop(0.5, c[1]);
    grad.addColorStop(1, c[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Draw stars (more = better performance)
    const starCount = 20 + streak * 5 + level * 15;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < Math.min(starCount, 100); i++) {
      const x = Math.sin(i * 137.5 * Math.PI / 180) * w / 2 + w / 2;
      const y = Math.cos(i * 97.3 * Math.PI / 180) * h / 2 + h / 2;
      const r = Math.random() * 1.5 + 0.5;
      ctx.beginPath();
      ctx.arc(x % w, y % h, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Central glow orb
    const orbGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h / 3);
    const orbColors = [
      ['rgba(108,99,255,0.8)', 'rgba(108,99,255,0)'],
      ['rgba(0,212,255,0.6)', 'rgba(0,212,255,0)'],
      ['rgba(0,230,118,0.6)', 'rgba(0,230,118,0)'],
      ['rgba(255,179,0,0.7)', 'rgba(255,179,0,0)'],
      ['rgba(255,100,100,0.8)', 'rgba(255,100,100,0)'],
    ][level];
    orbGrad.addColorStop(0, orbColors[0]);
    orbGrad.addColorStop(1, orbColors[1]);
    ctx.fillStyle = orbGrad;
    ctx.fillRect(0, 0, w, h);

    // Art character based on level
    const artEmojis = ['😴', '📖', '📚', '⚡', '🔥'];
    const messages = [
      'هنوز شروع نکردی؟',
      `${fmtHM(Storage.getTodayStudyTime())} مطالعه کردی`,
      'داری پیش میری! 💪',
      'روز عالی! ⭐',
      'حماسی! تو کنکور می‌دی 🔥',
    ];

    ctx.font = `${Math.min(w, h) * 0.25}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(artEmojis[level], w / 2, h / 2 - h * 0.08);

    ctx.font = `bold ${Math.min(w * 0.04, 14)}px Vazirmatn, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(messages[level], w / 2, h / 2 + h * 0.18);

    if (streak > 1) {
      ctx.font = `${Math.min(w * 0.035, 12)}px Vazirmatn, sans-serif`;
      ctx.fillStyle = 'rgba(255,220,100,0.9)';
      ctx.fillText(`🔥 ${streak} روز متوالی`, w / 2, h / 2 + h * 0.3);
    }
  },

  renderWeekChart() {
    const canvas = document.getElementById('week-chart');
    if (!canvas) return;
    if (this.charts.week) this.charts.week.destroy();

    const weekData = Storage.getWeekSessions();
    const labels = weekData.map(d => {
      const date = new Date(d.day);
      return date.toLocaleDateString('fa-IR', { weekday: 'short' });
    });
    const data = weekData.map(d => Math.round(d.totalSeconds / 60)); // minutes

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (document.documentElement.getAttribute('data-theme') === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    this.charts.week = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'دقیقه مطالعه',
          data,
          backgroundColor: data.map((v, i) => {
            if (i === data.length - 1) return 'rgba(108,99,255,0.9)';
            return 'rgba(108,99,255,0.35)';
          }),
          borderColor: 'rgba(108,99,255,1)',
          borderWidth: 1,
          borderRadius: 8,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => fmtHM(ctx.parsed.y * 60)
            }
          }
        },
        scales: {
          x: {
            ticks: { color: isDark ? '#aaa' : '#555', font: { family: 'Vazirmatn' } },
            grid: { display: false },
          },
          y: {
            ticks: {
              color: isDark ? '#aaa' : '#555',
              font: { family: 'Vazirmatn' },
              callback: v => fmtHM(v * 60)
            },
            grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
          }
        }
      }
    });
  },

  renderDistractionHeatmap() {
    const container = document.getElementById('heatmap-container');
    if (!container) return;
    const slots = Storage.getHeatmapData();
    const max = Math.max(...slots, 1);

    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'heatmap-grid';

    slots.forEach((val, i) => {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      const intensity = val / max;
      const h = 240 - Math.round(intensity * 200); // blue to red
      cell.style.background = val > 0 ? `hsl(${h}, 80%, ${30 + intensity * 30}%)` : '';
      const hour = Math.floor(i / 2);
      const min = i % 2 === 0 ? '00' : '30';
      cell.title = `${hour}:${min} - ${val} حواس‌پرتی`;

      if (i % 2 === 0) {
        const label = document.createElement('span');
        label.className = 'heatmap-label';
        label.textContent = hour;
        cell.appendChild(label);
      }
      grid.appendChild(cell);
    });

    container.appendChild(grid);
  },

  renderSessionsList() {
    const list = document.getElementById('sessions-list');
    if (!list) return;
    const sessions = Storage.getTodaySessions().reverse();
    if (!sessions.length) {
      list.innerHTML = '<div class="empty-state">هنوز جلسه‌ای ثبت نشده 📚</div>';
      return;
    }
    list.innerHTML = sessions.map(s => `
      <div class="session-item">
        <div class="session-info">
          <span class="session-subject">${s.subject || '---'}</span>
          <span class="session-topic">${s.topic || ''}</span>
        </div>
        <div class="session-meta">
          <span class="session-duration">${fmtHM(s.duration || 0)}</span>
          <span class="session-tests">${s.testCount || 0} تست</span>
          ${'⭐'.repeat(Math.round((s.satisfaction || 5) / 2))}
        </div>
      </div>
    `).join('');
  },
};

function fmtHM(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

window.Dashboard = Dashboard;
window.fmtHM = fmtHM;
