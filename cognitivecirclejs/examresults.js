/* ══════════════════════════════════════════════════════════
   THE COGNITIVE CIRCLE — Exam Results Admin JS
   Reads from: GET /api/results  (server-side Netlify DB)
   Fallback:   cc_results (localStorage)
   ══════════════════════════════════════════════════════════ */

'use strict';

const PALETTE = ['#2563eb','#16a34a','#ea580c','#7c3aed','#0891b2','#db2777','#65a30d','#d97706'];

let allResults = [];
let filtered   = [];
let curTab     = 'student';
let curPage    = 1;
const PAGE_SIZE = 10;
let donutChart = null;
let qaChart    = null;

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  wireSidebar();
  wireTabs();
  wireControls();        // wires listeners (dropdowns populated after data loads)
  wireExport();
  wireModal();
  wireNotifications();   // notification bell
  loadResults();         // async — populates filters + notifications when done

  // ── Real-time result updates ────────────────────────────
  window.addEventListener('resultSubmitted', (e) => {
    const newResult = e.detail;
    if (newResult) {
      allResults.push(newResult);
      localStorage.setItem('cc_results', JSON.stringify(allResults));
      // Reload view to show new result
      applyFilters();
      renderStats();
      renderScoreDist();
      renderTopStudents();
      renderQA();
      // Show notification in bell
      refreshNotifications();
      // Show toast
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = `🎉 New result: ${newResult.examTitle} by ${newResult.candidate?.name || 'Student'}`;
        toast.className = 'toast show success';
        setTimeout(() => toast.classList.remove('show'), 4000);
      }
    }
  });
});

// ── Load data ─────────────────────────────────────────────
async function loadResults() {
  showLoading(true);

  // On GitHub Pages or static hosting there is no /api/results endpoint,
  // so read from localStorage directly.
  let useApi = false;
  try {
    const url = new URL(window.location.href);
    if (url.hostname !== 'mr-ninu.github.io' && url.hostname !== 'localhost') {
      useApi = false;
    } else {
      useApi = false;
    }
  } catch (_) {
    useApi = false;
  }

  if (useApi) {
    try {
      const res = await fetch('/api/results');
      if (!res.ok) throw new Error('API error');
      allResults = await res.json();
    } catch (_) {
      allResults = readResultsFromStorage();
    }
  } else {
    allResults = readResultsFromStorage();
  }

  showLoading(false);
  populateFilters();      // ← now runs AFTER allResults is loaded
  refreshNotifications(); // build bell list from results
  applyFilters();
  renderStats();
  renderScoreDist();
  renderTopStudents();
  renderQA();
}

function readResultsFromStorage() {
  try {
    return JSON.parse(localStorage.getItem('cc_results') || '[]');
  } catch (_) {
    return [];
  }
}


// ── Populate Exam + Subject dropdowns ─────────────────────
function populateFilters() {
  const examSel = document.getElementById('examFilter');
  if (examSel) {
    // keep "All Exams", clear extras
    examSel.querySelectorAll('option:not([value=""])').forEach(o => o.remove());
    const exams = [...new Set(allResults.map(r => r.examTitle).filter(Boolean))].sort();
    exams.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      examSel.appendChild(opt);
    });
  }
  const subjectSel = document.getElementById('subjectFilter');
  if (subjectSel) {
    subjectSel.querySelectorAll('option:not([value=""])').forEach(o => o.remove());
    const subjects = [...new Set(allResults.map(r => r.subject).filter(Boolean))].sort();
    subjects.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      subjectSel.appendChild(opt);
    });
  }
}

function showLoading(on) {
  const el = document.getElementById('tableLoading');
  if (el) el.style.display = on ? '' : 'none';
  const tbody = document.getElementById('tableBody');
  if (tbody && on) tbody.innerHTML = '';
}

// ── Stats ─────────────────────────────────────────────────
function renderStats() {
  const r = allResults;
  const uniqueStudents = new Set(r.map(x => x.candidate?.regNumber || x.candidate?.name).filter(Boolean));
  const pcts  = r.map(x => x.percentage ?? 0);
  const avg   = pcts.length ? Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length) : 0;
  const best  = pcts.length ? Math.max(...pcts) : 0;
  const pass  = pcts.length ? Math.round(pcts.filter(p => p >= 40).length / pcts.length * 100) : 0;
  const bestResult = r.find(x => (x.percentage ?? 0) === best);

  setTxt('statTotalExams',    r.length.toLocaleString());
  setTxt('statTotalStudents', uniqueStudents.size.toLocaleString());
  setTxt('statAvgScore',      avg + '%');
  setTxt('statHighest',       best + '%');
  setTxt('statHighestLabel',  bestResult ? (bestResult.examTitle || '') : '');
  setTxt('statPassRate',      pass + '%');
}

// ── Score distribution donut ──────────────────────────────
function renderScoreDist() {
  const pcts = allResults.map(r => r.percentage ?? 0);
  const buckets = [
    { label: '90–100% (Excellent)',  color: '#2563eb', min: 90, max: 100 },
    { label: '80–89% (Very Good)',   color: '#16a34a', min: 80, max: 89 },
    { label: '70–79% (Good)',        color: '#65a30d', min: 70, max: 79 },
    { label: '50–69% (Average)',     color: '#ea580c', min: 50, max: 69 },
    { label: 'Below 50% (Poor)',     color: '#dc2626', min: 0,  max: 49 },
  ];

  const counts = buckets.map(b => pcts.filter(p => p >= b.min && p <= b.max).length);
  const total  = pcts.length || 1;

  // Legend
  const legend = document.getElementById('distLegend');
  if (legend) {
    legend.innerHTML = '';
    buckets.forEach((b, i) => {
      const pct = Math.round(counts[i] / total * 100);
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="dist-dot" style="background:${b.color}"></span>
        <span class="dist-label">${b.label}</span>
        <span class="dist-pct">${pct}%</span>`;
      legend.appendChild(li);
    });
  }

  const ctx = document.getElementById('donutChart')?.getContext('2d');
  if (!ctx) return;
  if (donutChart) donutChart.destroy();
  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [{ data: counts.map(c => c || 0), backgroundColor: buckets.map(b => b.color), borderWidth: 3, borderColor: '#fff', hoverOffset: 4 }]
    },
    options: { cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${c.parsed} result${c.parsed !== 1 ? 's' : ''}` } } }, animation: { duration: 800 } }
  });
}

// ── Top students ──────────────────────────────────────────
function renderTopStudents() {
  const studentMap = {};
  allResults.forEach(r => {
    const key = r.candidate?.regNumber || r.candidate?.name || 'unknown';
    if (!studentMap[key]) {
      studentMap[key] = { name: r.candidate?.name || 'Unknown', reg: r.candidate?.regNumber || '—', scores: [] };
    }
    studentMap[key].scores.push(r.percentage ?? 0);
  });

  const ranked = Object.values(studentMap)
    .map(s => ({ ...s, avg: Math.round(s.scores.reduce((a,b)=>a+b,0)/s.scores.length) }))
    .sort((a,b) => b.avg - a.avg)
    .slice(0, 5);

  const container = document.getElementById('topStudentsList');
  if (!container) return;
  container.innerHTML = '';

  if (!ranked.length) {
    container.innerHTML = '<p style="padding:20px;text-align:center;color:var(--gray-400);font-size:13px;">No results yet.</p>';
    return;
  }

  const rankClasses = ['gold','silver','bronze'];
  ranked.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'top-student-row';
    div.innerHTML = `
      <span class="rank-num ${rankClasses[i] || ''}">${i+1}</span>
      <div class="student-initials" style="background:${PALETTE[i % PALETTE.length]};width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">
        ${initials2(s.name)}
      </div>
      <div class="ts-info">
        <div class="ts-name">${escHtml(s.name)}</div>
        <div class="ts-reg">${escHtml(s.reg)}</div>
        <div class="ts-bar-wrap"><div class="ts-bar" style="width:${s.avg}%"></div></div>
      </div>
      <span class="ts-score">${s.avg}%</span>`;
    container.appendChild(div);
  });
}

// ── Question analysis ─────────────────────────────────────
function renderQA() {
  if (!allResults.length) return;

  // Aggregate questions across all results
  const qMap = {};
  allResults.forEach(r => {
    const questions = r.questions || [];
    const answers   = r.answers  || {};
    questions.forEach((q, i) => {
      const key   = q.question || q.text || `Q${i}`;
      const topic = q.topic    || r.subject || '—';
      if (!qMap[key]) qMap[key] = { text: key, topic, total: 0, incorrect: 0 };
      qMap[key].total++;
      const ans = answers[i];
      if (ans && ans !== q.correctAnswer) qMap[key].incorrect++;
    });
  });

  const sorted = Object.values(qMap)
    .filter(q => q.total > 0)
    .sort((a,b) => (b.incorrect/b.total) - (a.incorrect/a.total))
    .slice(0, 5);

  // Build missed questions table
  const tbody = document.getElementById('missedTable');
  if (tbody) {
    tbody.innerHTML = '';
    sorted.forEach((q, i) => {
      const pct = Math.round(q.incorrect / q.total * 100);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i+1}</td>
        <td style="max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(q.text)}</td>
        <td>${escHtml(q.topic)}</td>
        <td>
          <span class="missed-bar-wrap"><span class="missed-bar" style="width:${pct}%"></span></span>
          <span style="margin-left:6px;font-weight:600;color:var(--red)">${pct}%</span>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  // QA summary donut
  const total  = allResults.reduce((s,r)=>s+(r.total||0),0);
  const correct= allResults.reduce((s,r)=>s+(r.correct||0),0);
  const wrong  = allResults.reduce((s,r)=>s+(r.wrong||0),0);
  const skipped= allResults.reduce((s,r)=>s+(r.skipped||0),0);

  setTxt('qaTotal',   total);
  setTxt('qaCorrect', correct + ` (${total ? Math.round(correct/total*100) : 0}%)`);
  setTxt('qaWrong',   wrong   + ` (${total ? Math.round(wrong/total*100)   : 0}%)`);
  setTxt('qaSkipped', skipped + ` (${total ? Math.round(skipped/total*100) : 0}%)`);

  const ctx = document.getElementById('qaDonut')?.getContext('2d');
  if (!ctx) return;
  if (qaChart) qaChart.destroy();
  qaChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Correct','Incorrect','Unattempted'],
      datasets: [{ data: [correct, wrong, skipped], backgroundColor: ['#16a34a','#dc2626','#94a3b8'], borderWidth: 3, borderColor: '#fff' }]
    },
    options: { cutout: '65%', plugins: { legend: { display: false } }, animation: { duration: 800 } }
  });
}

// ── Tabs ──────────────────────────────────────────────────
function wireTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      curTab = btn.dataset.tab;
      curPage = 1;
      applyFilters();
    });
  });
}

// ── Controls ──────────────────────────────────────────────
function wireControls() {
  document.getElementById('searchInput')?.addEventListener('input', () => { curPage = 1; applyFilters(); });
  document.getElementById('examFilter')?.addEventListener('change', () => { curPage = 1; applyFilters(); });
  document.getElementById('subjectFilter')?.addEventListener('change', () => { curPage = 1; applyFilters(); });
  document.getElementById('sortFilter')?.addEventListener('change', () => { curPage = 1; applyFilters(); });
}

// ── Filter & render table ─────────────────────────────────
function applyFilters() {
  const search  = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const exam    = document.getElementById('examFilter')?.value  || '';
  const subject = document.getElementById('subjectFilter')?.value || '';
  const sort    = document.getElementById('sortFilter')?.value || 'score-desc';

  filtered = allResults.filter(r => {
    if (exam    && r.examTitle !== exam)    return false;
    if (subject && r.subject  !== subject)  return false;
    if (search) {
      const name  = (r.candidate?.name       || '').toLowerCase();
      const reg   = (r.candidate?.regNumber  || '').toLowerCase();
      const title = (r.examTitle             || '').toLowerCase();
      if (!name.includes(search) && !reg.includes(search) && !title.includes(search)) return false;
    }
    return true;
  });

  // Sort
  const sorters = {
    'score-desc':  (a,b) => (b.percentage ?? 0) - (a.percentage ?? 0),
    'score-asc':   (a,b) => (a.percentage ?? 0) - (b.percentage ?? 0),
    'date-desc':   (a,b) => new Date(b.submitTime||0) - new Date(a.submitTime||0),
    'date-asc':    (a,b) => new Date(a.submitTime||0) - new Date(b.submitTime||0),
    'name-asc':    (a,b) => (a.candidate?.name||'').localeCompare(b.candidate?.name||''),
  };
  filtered.sort(sorters[sort] || sorters['score-desc']);

  setTxt('totalLabel', `Showing ${filtered.length.toLocaleString()} result${filtered.length !== 1 ? 's' : ''}`);
  renderTable();
  renderPagination();
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const start = (curPage - 1) * PAGE_SIZE;
  const page  = filtered.slice(start, start + PAGE_SIZE);

  if (!page.length) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    tr.innerHTML = `<td colspan="9" style="text-align:center;padding:48px;color:var(--gray-400);">
      <i data-lucide="file-search" style="width:32px;height:32px;margin:0 auto 10px;display:block;"></i>
      No results found.
    </td>`;
    tbody.appendChild(tr);
    lucide.createIcons();
    return;
  }

  page.forEach((r, localIdx) => {
    const globalIdx = start + localIdx + 1;
    const name   = r.candidate?.name       || 'Unknown';
    const reg    = r.candidate?.regNumber  || '—';
    const prog   = r.candidate?.programme  || '—';
    const pct    = r.percentage ?? 0;
    const grade  = gradeFor(pct);
    const color  = PALETTE[(start + localIdx) % PALETTE.length];
    const subj   = r.subject || '—';
    const subjColor = subjectColorFor(subj);
    const submitDate = r.submitTime ? new Date(r.submitTime) : null;
    const dateStr = submitDate ? submitDate.toLocaleDateString('en-GB', { day:'numeric',month:'short',year:'numeric' }) : '—';

    // Time taken
    const timeTaken = (r.startTime && r.submitTime)
      ? timeDiff(r.startTime, r.submitTime)
      : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;color:var(--gray-400);font-size:12px;">${globalIdx}</td>
      <td>
        <div class="student-cell">
          <div class="student-initials" style="background:${color}">${initials2(name)}</div>
          <div>
            <div class="student-name">${escHtml(name)}</div>
            <div class="student-sub">${escHtml(reg)}</div>
          </div>
        </div>
      </td>
      <td>
        <div style="font-weight:500;font-size:13px;">${escHtml(r.examTitle || '—')}</div>
        <div style="font-size:11.5px;color:var(--gray-400);">${dateStr}</div>
      </td>
      <td><span class="subject-tag" style="background:${subjColor}18;color:${subjColor}">${escHtml(subj)}</span></td>
      <td>
        <span class="score-pill ${grade.toLowerCase()}">${pct}%</span>
        <span class="grade-badge ${grade}" style="margin-left:6px;">${grade}</span>
      </td>
      <td style="color:var(--green);font-weight:600;">${r.correct ?? '—'}</td>
      <td style="color:var(--red);font-weight:600;">${r.wrong ?? '—'}</td>
      <td style="color:var(--gray-400);font-weight:500;">${r.skipped ?? '—'}</td>
      <td style="font-size:12.5px;color:var(--gray-500);">${timeTaken}</td>
      <td>
        <button class="action-btn view-detail-btn" data-id="${r.id ?? ''}" data-idx="${start + localIdx}" title="View details">
          <i data-lucide="eye"></i>
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  // Wire detail buttons
  tbody.querySelectorAll('.view-detail-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.idx;
      openModal(filtered[idx]);
    });
  });

  lucide.createIcons();
}

// ── Pagination ────────────────────────────────────────────
function renderPagination() {
  const total = Math.ceil(filtered.length / PAGE_SIZE);
  const wrap  = document.getElementById('pagination');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (total <= 1) return;

  const addBtn = (label, page, disabled, isActive) => {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (isActive ? ' active' : '');
    btn.innerHTML = label;
    btn.disabled  = disabled;
    btn.addEventListener('click', () => { curPage = page; renderTable(); renderPagination(); });
    wrap.appendChild(btn);
  };

  addBtn('<i data-lucide="chevron-left" style="width:14px;height:14px"></i>', curPage - 1, curPage <= 1, false);

  // Show up to 5 page numbers
  const start = Math.max(1, Math.min(curPage - 2, total - 4));
  const end   = Math.min(total, start + 4);

  if (start > 1) {
    addBtn('1', 1, false, false);
    if (start > 2) { const sp = document.createElement('span'); sp.className = 'page-ellipsis'; sp.textContent = '…'; wrap.appendChild(sp); }
  }
  for (let p = start; p <= end; p++) addBtn(String(p), p, false, p === curPage);
  if (end < total) {
    if (end < total - 1) { const sp = document.createElement('span'); sp.className = 'page-ellipsis'; sp.textContent = '…'; wrap.appendChild(sp); }
    addBtn(String(total), total, false, false);
  }

  addBtn('<i data-lucide="chevron-right" style="width:14px;height:14px"></i>', curPage + 1, curPage >= total, false);
  lucide.createIcons();
}

// ── Modal ─────────────────────────────────────────────────
function wireModal() {
  document.getElementById('modalClose')?.addEventListener('click', closeModal);
  document.getElementById('resultModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
}

function openModal(r) {
  const name  = r.candidate?.name      || 'Unknown';
  const reg   = r.candidate?.regNumber || '—';
  const prog  = r.candidate?.programme || '—';
  const pct   = r.percentage ?? 0;
  const grade = gradeFor(pct);

  const submitDate = r.submitTime ? new Date(r.submitTime) : null;
  const dateStr = submitDate ? submitDate.toLocaleString('en-GB', { day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit' }) : '—';

  document.getElementById('modalTitle').textContent = `Result — ${name}`;
  document.getElementById('modalBody').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
      <div class="student-initials" style="background:var(--blue);width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;flex-shrink:0">${initials2(name)}</div>
      <div>
        <div style="font-size:16px;font-weight:700;">${escHtml(name)}</div>
        <div style="font-size:12.5px;color:var(--gray-500);">${escHtml(reg)} · ${escHtml(prog)}</div>
      </div>
      <span class="score-pill ${grade.toLowerCase()}" style="margin-left:auto;font-size:18px;padding:5px 14px;">${pct}% <span class="grade-badge ${grade}" style="font-size:13px;width:24px;height:24px;vertical-align:middle">${grade}</span></span>
    </div>
    <div style="background:var(--gray-50);border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:var(--gray-600);">
      <strong>${escHtml(r.examTitle || '—')}</strong> · ${escHtml(r.subject || '—')} · ${dateStr}
    </div>
    <div class="modal-stats-row">
      <div class="modal-stat"><span class="modal-stat-val" style="color:var(--green)">${r.correct ?? '—'}</span><span class="modal-stat-lbl">Correct</span></div>
      <div class="modal-stat"><span class="modal-stat-val" style="color:var(--red)">${r.wrong ?? '—'}</span><span class="modal-stat-lbl">Wrong</span></div>
      <div class="modal-stat"><span class="modal-stat-val" style="color:var(--gray-400)">${r.skipped ?? '—'}</span><span class="modal-stat-lbl">Skipped</span></div>
      <div class="modal-stat"><span class="modal-stat-val" style="color:var(--blue)">${r.marksEarned ?? '—'}/${r.totalMarks ?? '—'}</span><span class="modal-stat-lbl">Marks</span></div>
    </div>
    <div style="text-align:center;padding:10px 0;color:var(--gray-400);font-size:12.5px;">Time taken: ${(r.startTime && r.submitTime) ? timeDiff(r.startTime, r.submitTime) : '—'}</div>
  `;

  document.getElementById('resultModal').classList.add('open');
  lucide.createIcons();
}
function closeModal() { document.getElementById('resultModal')?.classList.remove('open'); }

// ── Export CSV ────────────────────────────────────────────
function wireExport() {
  document.getElementById('exportBtn')?.addEventListener('click', () => {
    const rows = [['#','Student Name','Reg Number','Programme','Exam','Subject','Score (%)','Grade','Correct','Wrong','Skipped','Marks Earned','Total Marks','Submit Time']];
    filtered.forEach((r, i) => {
      const pct = r.percentage ?? 0;
      rows.push([
        i+1,
        r.candidate?.name || '',
        r.candidate?.regNumber || '',
        r.candidate?.programme || '',
        r.examTitle || '',
        r.subject || '',
        pct,
        gradeFor(pct),
        r.correct ?? '',
        r.wrong ?? '',
        r.skipped ?? '',
        r.marksEarned ?? '',
        r.totalMarks ?? '',
        r.submitTime || '',
      ]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `exam-results-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Download report buttons
  document.querySelectorAll('.report-dl').forEach(btn => {
    btn.addEventListener('click', () => wireExport.download(btn.dataset.type));
  });
}

// ── Sidebar toggle ────────────────────────────────────────
function wireSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle  = document.getElementById('sidebarToggle');
  toggle?.addEventListener('click', () => {
    if (window.innerWidth <= 768) sidebar.classList.toggle('open');
    else sidebar.classList.toggle('collapsed');
    setTimeout(() => lucide.createIcons(), 50);
  });
  document.addEventListener('click', e => {
    if (window.innerWidth <= 768 && sidebar?.classList.contains('open') &&
        !sidebar.contains(e.target) && !toggle?.contains(e.target))
      sidebar.classList.remove('open');
  });
}

// ── Utilities ─────────────────────────────────────────────
function gradeFor(pct) {
  if (pct >= 75) return 'A';
  if (pct >= 65) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 40) return 'D';
  return 'F';
}

const SUBJECT_COLORS = {
  Physics: '#2563eb', Mathematics: '#16a34a', Math: '#16a34a',
  Biology: '#d97706', Chemistry: '#dc2626', English: '#7c3aed',
  'Computer Science': '#0891b2', History: '#ea580c', Geography: '#65a30d',
  Economics: '#5c6bc0', Literature: '#0d9488',
};
function subjectColorFor(subject) { return SUBJECT_COLORS[subject] || '#64748b'; }

function initials2(name) {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] || '?').toUpperCase();
  return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
}

function timeDiff(start, end) {
  const diff = Math.floor((new Date(end) - new Date(start)) / 1000);
  if (isNaN(diff) || diff < 0) return '—';
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function setTxt(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════════════════
// NOTIFICATIONS — bell dropdown of recent exam submissions
// ══════════════════════════════════════════════════════════
const NOTIF_SEEN_KEY = 'cc_notif_seen_ts';

function wireNotifications() {
  const bell  = document.getElementById('notifBell');
  const panel = document.getElementById('notifPanel');
  if (!bell || !panel) return;

  bell.addEventListener('click', e => {
    e.stopPropagation();
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) markNotificationsSeen();
  });
  document.addEventListener('click', e => {
    if (!panel.contains(e.target) && !bell.contains(e.target)) panel.classList.remove('open');
  });
  document.getElementById('notifClear')?.addEventListener('click', e => {
    e.stopPropagation();
    localStorage.setItem(NOTIF_SEEN_KEY, String(Date.now()));
    refreshNotifications();
  });
}

function refreshNotifications() {
  const list = document.getElementById('notifList');
  const badge = document.getElementById('notifBadge');
  if (!list || !badge) return;

  // Take 10 most recent submissions
  const recent = [...allResults]
    .filter(r => r.submitTime)
    .sort((a,b) => new Date(b.submitTime) - new Date(a.submitTime))
    .slice(0, 10);

  const seenTs = parseInt(localStorage.getItem(NOTIF_SEEN_KEY) || '0', 10);
  const unread = recent.filter(r => new Date(r.submitTime).getTime() > seenTs).length;

  badge.textContent = unread;
  badge.style.display = unread > 0 ? '' : 'none';

  list.innerHTML = '';
  if (!recent.length) {
    list.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
    return;
  }
  recent.forEach(r => {
    const isUnread = new Date(r.submitTime).getTime() > seenTs;
    const name = r.candidate?.name || 'A student';
    const pct  = r.percentage ?? 0;
    const exam = r.examTitle || 'an exam';
    const when = timeAgo(r.submitTime);
    const dot  = isUnread ? '<span class="notif-dot"></span>' : '';
    const row = document.createElement('div');
    row.className = 'notif-item' + (isUnread ? ' unread' : '');
    row.innerHTML = `
      ${dot}
      <div class="notif-icon" style="background:${PALETTE[Math.floor(Math.random()*PALETTE.length)]}">
        ${initials2(name)}
      </div>
      <div class="notif-body">
        <div class="notif-text"><strong>${escHtml(name)}</strong> submitted <strong>${escHtml(exam)}</strong></div>
        <div class="notif-meta">Score: <strong>${pct}%</strong> · ${when}</div>
      </div>`;
    list.appendChild(row);
  });
}

function markNotificationsSeen() {
  localStorage.setItem(NOTIF_SEEN_KEY, String(Date.now()));
  setTimeout(refreshNotifications, 100);
}

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (isNaN(diff)) return '—';
  if (diff < 60)        return 'just now';
  if (diff < 3600)      return Math.floor(diff/60) + 'm ago';
  if (diff < 86400)     return Math.floor(diff/3600) + 'h ago';
  if (diff < 86400*7)   return Math.floor(diff/86400) + 'd ago';
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
}
