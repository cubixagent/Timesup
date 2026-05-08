// TimesUp PDF Generator
const PDFGen = {
  async generateDailyReport(date = new Date()) {
    // Dynamically load jsPDF if not already loaded
    if (typeof window.jspdf === 'undefined' && typeof jspdf === 'undefined') {
      await this._loadjsPDF();
    }
    const { jsPDF } = window.jspdf || jspdf;
    
    const sessions = Storage.getSessions().filter(s => {
      return s.completed && new Date(s.startTime).toDateString() === date.toDateString();
    });

    const totalSeconds = sessions.reduce((s, ses) => s + (ses.duration || 0), 0);
    const totalTests = sessions.reduce((s, ses) => s + (ses.testCount || 0), 0);
    const totalDistractions = sessions.reduce((s, ses) => s + (ses.distractions || 0), 0);
    const avgSat = sessions.length ? Math.round(sessions.reduce((s, ses) => s + (ses.satisfaction || 5), 0) / sessions.length) : 0;
    const profile = Storage.getProfile();

    // Determine theme based on study hours
    const hours = totalSeconds / 3600;
    let theme, emoji, grade, gradeText;
    if (hours >= 8) { theme = { bg: '#0a0a2e', accent: '#6c63ff', card: '#1a1a3e', text: '#e0e0ff' }; emoji = '🔥'; grade = 'A+'; gradeText = 'فوق‌العاده! یه روز حماسی داشتی'; }
    else if (hours >= 6) { theme = { bg: '#0a1628', accent: '#00d4ff', card: '#0d2040', text: '#cce8ff' }; emoji = '⚡'; grade = 'A'; gradeText = 'عالی! تو مسیر درستی هستی'; }
    else if (hours >= 4) { theme = { bg: '#0f1a0f', accent: '#00e676', card: '#1a2e1a', text: '#ccffdd' }; emoji = '💪'; grade = 'B+'; gradeText = 'خوب! ادامه بده'; }
    else if (hours >= 2) { theme = { bg: '#1a1500', accent: '#ffb300', card: '#2e2600', text: '#fff3cc' }; emoji = '📚'; grade = 'B'; gradeText = 'قدمی در مسیر پیشرفت'; }
    else if (hours >= 0.5) { theme = { bg: '#1a0505', accent: '#ff5252', card: '#2e0a0a', text: '#ffcccc' }; emoji = '🌱'; grade = 'C'; gradeText = 'شروعی داشتی، فردا بیشتر!'; }
    else { theme = { bg: '#111111', accent: '#888888', card: '#1e1e1e', text: '#cccccc' }; emoji = '😴'; grade = 'D'; gradeText = 'امروز استراحت کردی؟ فردا جبران کن!'; }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210, H = 297;

    // Background
    doc.setFillColor(theme.bg.slice(1) === theme.bg ? '#111111' : theme.bg);
    const bgRgb = hexToRgb(theme.bg);
    doc.setFillColor(bgRgb.r, bgRgb.g, bgRgb.b);
    doc.rect(0, 0, W, H, 'F');

    // Gradient overlay (simulated with rectangles)
    const accentRgb = hexToRgb(theme.accent);
    for (let i = 0; i < 20; i++) {
      doc.setFillColor(accentRgb.r, accentRgb.g, accentRgb.b);
      doc.setGState(doc.GState({ opacity: 0.03 - i * 0.001 }));
      doc.ellipse(W * 0.8, 40 + i, 80 - i * 2, 80 - i * 2, 'F');
    }
    doc.setGState(doc.GState({ opacity: 1 }));

    // Header bar
    const cardRgb = hexToRgb(theme.card);
    doc.setFillColor(accentRgb.r, accentRgb.g, accentRgb.b);
    doc.rect(0, 0, W, 50, 'F');
    doc.setFillColor(cardRgb.r, cardRgb.g, cardRgb.b);
    doc.setGState(doc.GState({ opacity: 0.3 }));
    doc.rect(0, 0, W, 50, 'F');
    doc.setGState(doc.GState({ opacity: 1 }));

    // App name - using built-in font for Latin text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(255, 255, 255);
    doc.text('TimesUp', 20, 22);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 220, 255);
    doc.text('Daily Performance Report', 20, 32);

    // Date
    const dateStr = date.toLocaleDateString('fa-IR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    doc.setFontSize(10);
    doc.setTextColor(200, 200, 255);
    doc.text(dateStr, W - 20, 20, { align: 'right' });

    // Grade badge
    doc.setFillColor(255, 255, 255);
    doc.setGState(doc.GState({ opacity: 0.15 }));
    doc.roundedRect(W - 55, 25, 35, 18, 4, 4, 'F');
    doc.setGState(doc.GState({ opacity: 1 }));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(grade, W - 37.5, 37, { align: 'center' });

    let y = 65;

    // Stats row
    const stats = [
      { label: 'ساعت مطالعه', value: formatDuration(totalSeconds), icon: '⏱' },
      { label: 'تست زده شده', value: totalTests.toString(), icon: '📝' },
      { label: 'حواس‌پرتی', value: totalDistractions.toString(), icon: '🫣' },
      { label: 'رضایت', value: `${avgSat}/10`, icon: '⭐' },
    ];

    const cardW = (W - 50) / 4;
    stats.forEach((stat, i) => {
      const cx = 15 + i * (cardW + 4);
      doc.setFillColor(cardRgb.r, cardRgb.g, cardRgb.b);
      doc.roundedRect(cx, y, cardW, 30, 4, 4, 'F');
      doc.setFillColor(accentRgb.r, accentRgb.g, accentRgb.b);
      doc.setGState(doc.GState({ opacity: 0.3 }));
      doc.roundedRect(cx, y, cardW, 3, 1, 1, 'F');
      doc.setGState(doc.GState({ opacity: 1 }));

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(accentRgb.r, accentRgb.g, accentRgb.b);
      doc.text(stat.value, cx + cardW / 2, y + 15, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const textRgb = hexToRgb(theme.text);
      doc.setTextColor(textRgb.r, textRgb.g, textRgb.b);
      doc.text(stat.label, cx + cardW / 2, y + 24, { align: 'center' });
    });

    y += 45;

    // Sessions table
    doc.setFillColor(cardRgb.r, cardRgb.g, cardRgb.b);
    doc.roundedRect(15, y, W - 30, sessions.length > 0 ? 15 + sessions.length * 14 + 10 : 40, 6, 6, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(accentRgb.r, accentRgb.g, accentRgb.b);
    doc.text('Sessions Today', W - 20, y + 10, { align: 'right' });
    doc.text('جلسات امروز', 25, y + 10);

    y += 18;

    if (sessions.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const textRgb = hexToRgb(theme.text);
      doc.setTextColor(textRgb.r, textRgb.g, textRgb.b);
      doc.text('امروز جلسه‌ای ثبت نشده است', W / 2, y + 12, { align: 'center' });
      y += 30;
    } else {
      // Table header
      doc.setFillColor(accentRgb.r, accentRgb.g, accentRgb.b);
      doc.setGState(doc.GState({ opacity: 0.2 }));
      doc.rect(15, y - 2, W - 30, 10, 'F');
      doc.setGState(doc.GState({ opacity: 1 }));

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      const textRgb = hexToRgb(theme.text);
      doc.setTextColor(textRgb.r, textRgb.g, textRgb.b);
      doc.text('#', 22, y + 5);
      doc.text('Subject / درس', 32, y + 5);
      doc.text('Duration', 110, y + 5, { align: 'center' });
      doc.text('Tests', 145, y + 5, { align: 'center' });
      doc.text('Satisfaction', 175, y + 5, { align: 'center' });
      y += 12;

      sessions.forEach((s, i) => {
        if (i % 2 === 0) {
          doc.setFillColor(accentRgb.r, accentRgb.g, accentRgb.b);
          doc.setGState(doc.GState({ opacity: 0.05 }));
          doc.rect(15, y - 3, W - 30, 12, 'F');
          doc.setGState(doc.GState({ opacity: 1 }));
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(textRgb.r, textRgb.g, textRgb.b);
        doc.text(String(i + 1), 22, y + 5);
        const subjectStr = `${s.subject || '---'} - ${s.topic || ''}`.slice(0, 40);
        doc.text(subjectStr, 32, y + 5);
        doc.text(formatDuration(s.duration || 0), 110, y + 5, { align: 'center' });
        doc.text(String(s.testCount || 0), 145, y + 5, { align: 'center' });
        const stars = '★'.repeat(Math.round((s.satisfaction || 5) / 2));
        doc.setTextColor(accentRgb.r, accentRgb.g, accentRgb.b);
        doc.text(stars, 175, y + 5, { align: 'center' });
        doc.setTextColor(textRgb.r, textRgb.g, textRgb.b);
        y += 13;
      });
      y += 5;
    }

    y += 10;

    // Progress bar
    doc.setFillColor(cardRgb.r, cardRgb.g, cardRgb.b);
    doc.roundedRect(15, y, W - 30, 35, 6, 6, 'F');

    const targetHours = 8;
    const progress = Math.min(hours / targetHours, 1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const textRgb = hexToRgb(theme.text);
    doc.setTextColor(textRgb.r, textRgb.g, textRgb.b);
    doc.text('پیشرفت روزانه / Daily Progress', 25, y + 12);
    doc.text(`${Math.round(progress * 100)}%`, W - 25, y + 12, { align: 'right' });

    // Progress bar background
    doc.setFillColor(30, 30, 60);
    doc.roundedRect(20, y + 16, W - 40, 8, 4, 4, 'F');
    // Progress bar fill
    if (progress > 0) {
      doc.setFillColor(accentRgb.r, accentRgb.g, accentRgb.b);
      doc.roundedRect(20, y + 16, (W - 40) * progress, 8, 4, 4, 'F');
    }

    y += 50;

    // Summary / grade section
    doc.setFillColor(accentRgb.r, accentRgb.g, accentRgb.b);
    doc.setGState(doc.GState({ opacity: 0.15 }));
    doc.roundedRect(15, y, W - 30, 40, 6, 6, 'F');
    doc.setGState(doc.GState({ opacity: 1 }));

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(accentRgb.r, accentRgb.g, accentRgb.b);
    doc.text(emoji, 25, y + 28);

    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text(grade, 50, y + 25);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(textRgb.r, textRgb.g, textRgb.b);
    doc.text(gradeText, 65, y + 25);

    if (profile.name) {
      doc.setFontSize(9);
      doc.setTextColor(180, 180, 220);
      doc.text(`${profile.name} - ${profile.university || ''} - رتبه هدف: ${profile.targetRank || '---'}`, W / 2, y + 36, { align: 'center' });
    }

    y += 55;

    // Footer
    doc.setFillColor(cardRgb.r, cardRgb.g, cardRgb.b);
    doc.rect(0, H - 20, W, 20, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 180);
    doc.text('Generated by TimesUp | تایمزآپ', W / 2, H - 8, { align: 'center' });

    // Save
    const fileName = `TimesUp_${date.toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
  },

  async _loadjsPDF() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  },
};

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

window.PDFGen = PDFGen;
window.hexToRgb = hexToRgb;
window.formatDuration = formatDuration;
