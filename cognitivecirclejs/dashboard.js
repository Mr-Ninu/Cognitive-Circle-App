/* ══════════════════════════════════════════════════════════
   THE COGNITIVE CIRCLE — Dashboard JS
   Reads live data from localStorage:
     qb_questions  → Total Questions, Donut chart
     qb_subjects   → Total Subjects
     cc_exams      → Total Exams, Recent Exams table
     cc_results    → Exams Taken, Students, Activity, Line chart
   ══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // ── Init Lucide icons ──────────────────────────────────
  lucide.createIcons();

  // ── Load all data from localStorage ───────────────────
  const data = loadAllData();

  // ── Update each section ───────────────────────────────
  updateStatCards(data);
  buildRecentExamsTable(data.exams);
  buildActivityFeed(data);
  buildDonutChart(data.questions);
  buildLineChart(data.results);

  // ── Quick action buttons ───────────────────────────────
  wireQuickActions();

  // ── Sidebar toggle ─────────────────────────────────────
  const sidebar   = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebarToggle');

  toggleBtn.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('open');
    } else {
      sidebar.classList.toggle('collapsed');
    }
    setTimeout(() => lucide.createIcons(), 50);
  });

  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 &&
        sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        !toggleBtn.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });

  // ── Search keyboard shortcut ───────────────────────────
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      document.querySelector('.search-box input')?.focus();
    }
  });

  // ── Auto-refresh every 30 s (picks up changes from other tabs) ──
  setInterval(() => {
    const fresh = loadAllData();
    updateStatCards(fresh);
    buildRecentExamsTable(fresh.exams);
    buildActivityFeed(fresh);
    rebuildDonutChart(fresh.questions);
    buildLineChart(fresh.results);
  }, 30000);

});

/* ═══════════════════════════════════════════════════════════
   DATA LOADING
═══════════════════════════════════════════════════════════ */
function loadAllData() {
  const parse = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (_) { return fallback; }
  };

  const rawQuestions = parse('qb_questions', []);
  const rawSubjects  = parse('qb_subjects',  []);
  const exams        = parse('cc_exams',     []);
  const results      = parse('cc_results',   []);

  // Normalise questions (filter out drafts)
  const questions = rawQuestions.filter(q => !q.draft);

  // Derive unique subjects from question bank if qb_subjects is empty
  const subjects = rawSubjects.length
    ? rawSubjects
    : [...new Set(questions.map(q => q.subject).filter(Boolean))];

  // Unique students who have submitted any exam
  const uniqueStudents = new Set(
    results.map(r => r.candidate?.regNumber).filter(Boolean)
  );

  return { questions, subjects, exams, results, uniqueStudents };
}

/* ═══════════════════════════════════════════════════════════
   STAT CARDS
═══════════════════════════════════════════════════════════ */
function updateStatCards(data) {
  const nums = document.querySelectorAll('.stat-num');
  if (!nums.length) return;

  const values = [
    data.subjects.length,           // Total Subjects
    data.questions.length,          // Total Questions
    data.exams.length,              // Total Exams
    data.uniqueStudents.size,       // Total Students
    data.results.length,            // Exams Taken
  ];

  nums.forEach((el, i) => {
    if (values[i] !== undefined) {
      animateCount(el, 0, values[i], 900);
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   RECENT EXAMS TABLE
═══════════════════════════════════════════════════════════ */
function buildRecentExamsTable(exams) {
  const tbody = document.getElementById('recentExamsBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!exams.length) {
    tbody.innerHTML = `
      <tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">
        No exams created yet. <a href="../exambuilder.html" style="color:var(--blue);font-weight:600;">Create your first exam →</a>
      </td></tr>`;
    return;
  }

  // Show the 5 most recent
  const recent = [...exams].reverse().slice(0, 5);
  recent.forEach(ex => {
    const color     = subjectColor(ex.subject);
    const duration  = ex.duration ? `${ex.duration} ${ex.durationUnit || 'min'}` : '—';
    const created   = timeAgo(ex.createdAt);
    const numQ      = ex.numQuestions || ex.questions?.length || '—';
    const statusBadge = ex.status === 'published'
      ? `<span style="background:#edfbf2;color:#34A853;padding:2px 9px;border-radius:20px;font-size:11.5px;font-weight:600;">Published</span>`
      : `<span style="background:#f4f6fb;color:var(--text-muted);padding:2px 9px;border-radius:20px;font-size:11.5px;">Draft</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:500;">${escHtml(ex.title || 'Untitled')}</td>
      <td><span class="subject-tag" style="background:${color}18;color:${color}">${escHtml(ex.subject || '—')}</span></td>
      <td>${numQ}</td>
      <td>${escHtml(duration)}</td>
      <td>${created}</td>
      <td>${statusBadge}</td>`;
    tbody.appendChild(tr);
  });
}

/* ═══════════════════════════════════════════════════════════
   ACTIVITY FEED
═══════════════════════════════════════════════════════════ */
function buildActivityFeed(data) {
  const actList = document.getElementById('activityList');
  if (!actList) return;
  actList.innerHTML = '';

  // Build events from real data
  const events = [];

  // Exam results (student submissions)
  data.results.forEach(r => {
    events.push({
      icon:      'check-circle',
      iconBg:    '#edfbf2',
      iconColor: '#34A853',
      text:      `<strong>${escHtml(r.candidate?.name || 'A student')}</strong> submitted <strong>${escHtml(r.examTitle || 'an exam')}</strong> — scored ${r.percentage ?? '?'}%`,
      time:      r.submitTime,
    });
  });

  // Exams created
  data.exams.forEach(ex => {
    const label = ex.status === 'published' ? 'published' : 'saved';
    events.push({
      icon:      ex.status === 'published' ? 'paper-plane' : 'file-plus',
      iconBg:    ex.status === 'published' ? '#eef4ff' : '#fff8e6',
      iconColor: ex.status === 'published' ? '#4285F4' : '#F9AB00',
      text:      `Exam <strong>${escHtml(ex.title || 'Untitled')}</strong> was ${label}`,
      time:      ex.createdAt,
    });
  });

  // Questions added (by subject, grouped by creation day)
  const qByDay = {};
  data.questions.forEach(q => {
    const day = q.createdAt ? q.createdAt.split('T')[0] : null;
    if (!day) return;
    if (!qByDay[day]) qByDay[day] = { subject: q.subject, count: 0, time: q.createdAt };
    qByDay[day].count++;
  });
  Object.values(qByDay).forEach(({ subject, count, time }) => {
    events.push({
      icon:      'database',
      iconBg:    '#f5eeff',
      iconColor: '#9C27B0',
      text:      `${count} question${count !== 1 ? 's' : ''} added to <strong>${escHtml(subject || 'Question Bank')}</strong>`,
      time,
    });
  });

  // Sort newest first, take top 8
  events.sort((a, b) => new Date(b.time) - new Date(a.time));
  const show = events.slice(0, 8);

  if (!show.length) {
    actList.innerHTML = `<div style="padding:28px;text-align:center;color:var(--text-muted);font-size:13px;">No activity yet. Start by creating an exam or adding questions.</div>`;
    return;
  }

  show.forEach(act => {
    const div = document.createElement('div');
    div.className = 'activity-item';
    div.innerHTML = `
      <div class="activity-icon" style="background:${act.iconBg}">
        <i data-lucide="${act.icon}" style="color:${act.iconColor}"></i>
      </div>
      <div class="activity-body">
        <span class="activity-text">${act.text}</span>
        <span class="activity-time">${act.time ? timeAgo(act.time) : '—'}</span>
      </div>`;
    actList.appendChild(div);
  });

  lucide.createIcons();
}

/* ═══════════════════════════════════════════════════════════
   DONUT CHART — Questions by Subject
═══════════════════════════════════════════════════════════ */
let donutChart = null;

const PALETTE = ['#4285F4','#34A853','#F9AB00','#EA4335','#9C27B0','#00ACC1','#FF7043','#8BC34A','#5C6BC0','#26A69A'];

function buildDonutChart(questions) {
  const ctx = document.getElementById('donutChart')?.getContext('2d');
  if (!ctx) return;

  const counts = {};
  questions.forEach(q => {
    const s = q.subject || 'Other';
    counts[s] = (counts[s] || 0) + 1;
  });

  const labels = Object.keys(counts);
  const values = labels.map(l => counts[l]);
  const colors = labels.map((_, i) => PALETTE[i % PALETTE.length]);

  if (!labels.length) {
    // No data — show placeholder
    const placeholder = [{ label: 'No questions yet', value: 1, color: '#e4e8f0' }];
    labels.push(placeholder[0].label);
    values.push(placeholder[0].value);
    colors.push(placeholder[0].color);
  }

  if (donutChart) donutChart.destroy();

  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data:            values,
        backgroundColor: colors,
        borderWidth:     3,
        borderColor:     '#fff',
        hoverOffset:     6,
      }]
    },
    options: {
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${c.parsed.toLocaleString()} question${c.parsed !== 1 ? 's' : ''}` }}
      },
      animation: { animateRotate: true, duration: 900 },
    }
  });

  // Custom legend
  const legend = document.getElementById('donutLegend');
  if (legend) {
    legend.innerHTML = '';
    labels.forEach((label, i) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <span class="legend-dot-sq" style="background:${colors[i]}"></span>
        <span>${escHtml(label)}</span>
        <span class="legend-count">${(values[i] || 0).toLocaleString()}</span>`;
      legend.appendChild(item);
    });
  }
}

function rebuildDonutChart(questions) {
  buildDonutChart(questions);
}

/* ═══════════════════════════════════════════════════════════
   LINE CHART — Exam performance over last 30 days
═══════════════════════════════════════════════════════════ */
let lineChart = null;

function buildLineChart(results) {
  const ctx = document.getElementById('lineChart')?.getContext('2d');
  if (!ctx) return;

  // Build last 8 weeks of data
  const now    = new Date();
  const labels = [];
  const taken  = [];
  const avgPct = [];

  for (let w = 7; w >= 0; w--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - w * 7 - 6);
    const weekEnd   = new Date(now);
    weekEnd.setDate(now.getDate() - w * 7);

    const weekLabel = weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    labels.push(weekLabel);

    const weekResults = results.filter(r => {
      const d = new Date(r.submitTime);
      return d >= weekStart && d <= weekEnd;
    });

    taken.push(weekResults.length);
    const avg = weekResults.length
      ? Math.round(weekResults.reduce((s, r) => s + (r.percentage || 0), 0) / weekResults.length)
      : 0;
    avgPct.push(avg);
  }

  if (lineChart) lineChart.destroy();

  lineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Exams Taken',
          data:  taken,
          borderColor:     '#4285F4',
          backgroundColor: 'rgba(66,133,244,0.08)',
          borderWidth: 2.5,
          pointBackgroundColor: '#4285F4',
          pointRadius: 4, pointHoverRadius: 6,
          tension: 0.35,
          fill: true,
          yAxisID: 'yLeft',
        },
        {
          label: 'Average Score (%)',
          data:  avgPct,
          borderColor:     '#34A853',
          backgroundColor: 'rgba(52,168,83,0.06)',
          borderWidth: 2.5,
          pointBackgroundColor: '#34A853',
          pointRadius: 4, pointHoverRadius: 6,
          tension: 0.35,
          fill: true,
          yAxisID: 'yRight',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: {
          grid: { color: '#f0f2f8', drawBorder: false },
          ticks: { color: '#9aa3b8', font: { size: 11, family: 'DM Sans' } }
        },
        yLeft: {
          type: 'linear', position: 'left',
          min: 0,
          grid: { color: '#f0f2f8', drawBorder: false },
          ticks: { color: '#9aa3b8', font: { size: 11 }, precision: 0 }
        },
        yRight: {
          type: 'linear', position: 'right',
          min: 0, max: 100,
          grid: { drawOnChartArea: false },
          ticks: { color: '#9aa3b8', font: { size: 11 }, callback: v => v + '%' }
        }
      },
      animation: { duration: 1000 }
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   QUICK ACTIONS
═══════════════════════════════════════════════════════════ */
function wireQuickActions() {
  const actions = {
    'Add Question':  'questionbank.html',
    'Create Exam':   'exambuilder.html',
    'Add Subject':   'questionbank.html',
    'View Results':  'examresults.html',
  };

  document.querySelectorAll('.quick-btn').forEach(btn => {
    const label = btn.querySelector('span')?.textContent?.trim();
    if (label && actions[label]) {
      btn.addEventListener('click', () => { window.location.href = actions[label]; });
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════ */
const SUBJECT_COLORS = {
  'Physics': '#4285F4', 'Mathematics': '#34A853', 'Math': '#34A853',
  'Biology': '#F9AB00', 'Chemistry': '#EA4335', 'English': '#9C27B0',
  'Computer Science': '#00ACC1', 'History': '#FF7043', 'Geography': '#8BC34A',
  'Economics': '#5C6BC0', 'Literature': '#26A69A',
};
function subjectColor(subject) {
  return SUBJECT_COLORS[subject] || '#9aa3b8';
}

function timeAgo(isoString) {
  if (!isoString) return '—';
  const diff = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (diff < 60)          return 'just now';
  if (diff < 3600)        return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400)       return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 86400 * 7)   return `${Math.floor(diff / 86400)} day${diff < 172800 ? '' : 's'} ago`;
  if (diff < 86400 * 30)  return `${Math.floor(diff / 86400 / 7)} week${diff < 86400*14 ? '' : 's'} ago`;
  return new Date(isoString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function animateCount(el, from, to, duration) {
  const start = performance.now();
  const step  = (now) => {
    const t    = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * ease).toLocaleString();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ═══════════════════════════════════════════════════════════
   NOTIFICATION SYSTEM
   Reads cc_exams + cc_results, compares with last-seen
   timestamp stored in localStorage key: cc_notif_seen
═══════════════════════════════════════════════════════════ */

// Build a flat list of notification events from localStorage data
function buildNotifEvents() {
  const parse = (key) => {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch (_) { return []; }
  };

  const exams   = parse('cc_exams');
  const results = parse('cc_results');
  const events  = [];

  // Student submission events
  results.forEach(r => {
    events.push({
      id:      `result_${r.submitTime}_${r.candidate?.regNumber || Math.random()}`,
      icon:    'check-circle',
      iconBg:  '#edfbf2',
      iconColor: '#34A853',
      text:    `<strong>${escHtml(r.candidate?.name || 'A student')}</strong> submitted <strong>${escHtml(r.examTitle || 'an exam')}</strong> — scored ${r.percentage ?? '?'}%`,
      time:    r.submitTime,
    });
  });

  // New exam created / published events
  exams.forEach(ex => {
    const isPublished = ex.status === 'published';
    events.push({
      id:      `exam_${ex.createdAt}_${ex.title}`,
      icon:    isPublished ? 'send' : 'file-plus',
      iconBg:  isPublished ? '#eef4ff' : '#fff8e6',
      iconColor: isPublished ? '#4285F4' : '#F9AB00',
      text:    `Exam <strong>${escHtml(ex.title || 'Untitled')}</strong> was ${isPublished ? 'published' : 'created'}`,
      time:    ex.createdAt,
    });
  });

  // Sort newest first
  events.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
  return events;
}

// Render the notification panel contents and update the badge
function renderNotifications() {
  const events     = buildNotifEvents();
  const lastSeen   = Number(localStorage.getItem('cc_notif_seen') || '0');
  const unreadList = events.filter(e => new Date(e.time || 0).getTime() > lastSeen);
  const unreadCnt  = unreadList.length;

  // Update badge
  const badge = document.getElementById('notifBadge');
  if (badge) {
    if (unreadCnt > 0) {
      badge.textContent = unreadCnt > 99 ? '99+' : unreadCnt;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // Update count label
  const countLabel = document.getElementById('notifCountLabel');
  if (countLabel) {
    countLabel.textContent = unreadCnt > 0 ? `(${unreadCnt} new)` : '';
  }

  // Render list
  const list = document.getElementById('notifList');
  if (!list) return;
  list.innerHTML = '';

  const toShow = events.slice(0, 20);

  if (!toShow.length) {
    list.innerHTML = `
      <div class="notif-empty">
        <i data-lucide="bell-off"></i>
        <p>No notifications yet.<br>Create exams or let students take them.</p>
      </div>`;
    lucide.createIcons();
    return;
  }

  toShow.forEach(ev => {
    const isUnread = new Date(ev.time || 0).getTime() > lastSeen;
    const div = document.createElement('div');
    div.className = 'notif-item' + (isUnread ? ' unread' : '');
    div.innerHTML = `
      <div class="notif-icon" style="background:${ev.iconBg}">
        <i data-lucide="${ev.icon}" style="color:${ev.iconColor}"></i>
      </div>
      <div class="notif-body">
        <span class="notif-text">${ev.text}</span>
        <span class="notif-time">${ev.time ? timeAgo(ev.time) : '—'}</span>
      </div>
      ${isUnread ? '<span class="notif-unread-dot"></span>' : ''}
    `;
    list.appendChild(div);
  });

  lucide.createIcons();
}

// Wire the notification bell button
function wireNotifications() {
  const btn    = document.getElementById('notifBtn');
  const panel  = document.getElementById('notifPanel');
  const markAll = document.getElementById('notifMarkAll');
  if (!btn || !panel) return;

  // Toggle panel on bell click
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = panel.classList.toggle('open');
    if (isOpen) {
      renderNotifications(); // refresh when opening
    }
  });

  // Mark all as read
  if (markAll) {
    markAll.addEventListener('click', (e) => {
      e.stopPropagation();
      localStorage.setItem('cc_notif_seen', Date.now().toString());
      renderNotifications();
      // Animate badge out
      const badge = document.getElementById('notifBadge');
      if (badge) badge.style.display = 'none';
    });
  }

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && !btn.contains(e.target)) {
      panel.classList.remove('open');
    }
  });

  // Initial render
  renderNotifications();

  // Poll every 30 s for new submissions from other tabs
  setInterval(renderNotifications, 30000);

  // Listen for storage events (real-time cross-tab)
  window.addEventListener('storage', (e) => {
    if (e.key === 'cc_results' || e.key === 'cc_exams') {
      renderNotifications();
    }
  });
}

// Add wireNotifications() call inside the DOMContentLoaded listener
document.addEventListener('DOMContentLoaded', () => {
  // This second listener merges safely — existing listener handles everything else
  wireNotifications();
});
